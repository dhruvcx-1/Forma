use std::{
    collections::BTreeMap,
    env,
    net::SocketAddr,
    path::Path,
    sync::{Arc, Mutex},
};

use aes_gcm::{Aes256Gcm, KeyInit, Nonce, aead::Aead};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use axum::{
    Json, Router,
    body::Body,
    extract::{FromRequest, Multipart, Path as RoutePath, Query, State},
    http::{HeaderValue, Method, Request, StatusCode, Uri, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use chrono::{Datelike, Duration, Utc};
use rand::{Rng, distributions::Alphanumeric};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use tower_http::cors::{AllowHeaders, AllowOrigin, CorsLayer};

type Db = Arc<Mutex<Connection>>;
struct ApiJson<T>(T);
impl<S, T> FromRequest<S> for ApiJson<T>
where
    S: Send + Sync,
    T: DeserializeOwned + 'static,
{
    type Rejection = Response;
    async fn from_request(req: Request<Body>, state: &S) -> Result<Self, Self::Rejection> {
        match Json::<T>::from_request(req, state).await {
            Ok(Json(value)) => Ok(Self(value)),
            Err(_) => Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error":"Validation failed","issues":[]})),
            )
                .into_response()),
        }
    }
}
#[derive(Clone)]
struct App {
    db: Db,
    production: bool,
}

fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({"error": message}))).into_response()
}
fn db(app: &App) -> std::sync::MutexGuard<'_, Connection> {
    app.db.lock().expect("sqlite mutex poisoned")
}
fn new_id() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(21)
        .map(char::from)
        .collect()
}

async fn authenticate(mut req: Request<Body>, next: Next) -> Response {
    // Authentication is performed per protected handler via this request extension.
    // Keeping cookie parsing independent of signed-cookie middleware matches the current API.
    let cookie = req
        .headers()
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let session = cookie
        .split(';')
        .filter_map(|part| part.trim().split_once('='))
        .find(|(k, _)| *k == "session_id")
        .map(|(_, v)| v.to_owned());
    req.extensions_mut().insert(session);
    next.run(req).await
}

#[derive(Serialize, Clone)]
struct Profile {
    id: String,
    username: String,
    display_name: Option<String>,
    avatar_url: Option<String>,
    bio: Option<String>,
    is_public: bool,
    role: String,
    created_at: String,
}
fn current_profile(app: &App, session: &Option<String>) -> Option<Profile> {
    let session_id = session.as_ref()?;
    let conn = db(app);
    conn.query_row(
        "SELECT p.id,p.username,p.display_name,p.avatar_url,p.bio,p.is_public,COALESCE(p.role,'user'),p.created_at FROM sessions s JOIN profiles p ON p.id=s.profile_id WHERE s.id=?1 AND s.expires_at>datetime('now')",
        [session_id], |r| Ok(Profile { id:r.get(0)?, username:r.get(1)?, display_name:r.get(2)?, avatar_url:r.get(3)?, bio:r.get(4)?, is_public:r.get::<_,i64>(5)? != 0, role:r.get(6)?, created_at:r.get(7)? })
    ).optional().ok().flatten()
}
fn set_session(app: &App, profile_id: &str) -> Result<String, rusqlite::Error> {
    let id = new_id();
    let expiry = (Utc::now() + Duration::days(30)).to_rfc3339();
    db(app).execute("DELETE FROM sessions WHERE expires_at<=datetime('now')", [])?;
    db(app).execute(
        "INSERT INTO sessions(id,profile_id,expires_at) VALUES(?1,?2,?3)",
        params![id, profile_id, expiry],
    )?;
    Ok(id)
}
fn session_cookie(id: &str, secure: bool) -> String {
    format!(
        "session_id={id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000{}",
        if secure { "; Secure" } else { "" }
    )
}
fn with_cookie(mut response: Response, value: String) -> Response {
    if let Ok(v) = HeaderValue::from_str(&value) {
        response.headers_mut().append(header::SET_COOKIE, v);
    }
    response
}
fn auth_or_response(app: &App, session: &Option<String>) -> Result<Profile, Response> {
    current_profile(app, session).ok_or_else(|| error(StatusCode::UNAUTHORIZED, "Unauthorized"))
}
fn schema_check(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let profiles: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='profiles'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let sessions: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='sessions'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if version < 10 || profiles != 1 || sessions != 1 {
        return Err(format!(
            "Expected the latest existing Forma schema (user_version >= 10); found version {version}. Rust startup never creates or migrates the schema."
        ));
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthInput {
    username: String,
    password: String,
    display_name: Option<String>,
}
async fn health() -> Json<Value> {
    Json(json!({"status":"ok","timestamp":Utc::now().to_rfc3339()}))
}
async fn fallback(uri: Uri) -> Response {
    let path = uri.path();
    if path == "/api" || path.starts_with("/api/") {
        return error(StatusCode::NOT_FOUND, "Not found");
    }
    let roots = [
        std::path::PathBuf::from("./packages/flutter_app/build/web"),
        std::path::PathBuf::from("../flutter_app/build/web"),
        std::path::PathBuf::from("./public"),
    ];
    let rel = path.trim_start_matches('/');
    let safe = !rel.split('/').any(|p| p == "..") && !rel.contains('\\');
    for root in roots {
        let index = root.join("index.html");
        if !index.exists() {
            continue;
        }
        let candidate = if safe && !rel.is_empty() {
            root.join(rel)
        } else {
            index.clone()
        };
        let candidate = if candidate.is_file() {
            candidate
        } else {
            index
        };
        let Ok(bytes) = std::fs::read(&candidate) else {
            continue;
        };
        let mime = match candidate.extension().and_then(|e| e.to_str()).unwrap_or("") {
            "html" => "text/html; charset=utf-8",
            "js" => "application/javascript",
            "css" => "text/css",
            "svg" => "image/svg+xml",
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "webp" => "image/webp",
            "ico" => "image/x-icon",
            "json" => "application/json",
            "wasm" => "application/wasm",
            _ => "application/octet-stream",
        };
        let mut res = Response::new(Body::from(bytes));
        res.headers_mut()
            .insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
        return res;
    }
    error(StatusCode::NOT_FOUND, "Not found")
}
async fn auth_status(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Json<Value> {
    let conn = db(&app);
    let count: i64 = conn
        .query_row("SELECT count(*) FROM profiles", [], |r| r.get(0))
        .unwrap_or(0);
    let registration = conn
        .query_row(
            "SELECT value FROM system_settings WHERE key='registration_enabled'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()
        .map(|v| v == "true" || v == "1")
        .unwrap_or_else(|| {
            env::var("ALLOW_REGISTRATION")
                .map(|v| v != "false" && v != "0")
                .unwrap_or(true)
        });
    let session = session.map(|s| s.0).unwrap_or(None);
    let authenticated = current_profile(&app, &session).is_some();
    Json(
        json!({"isSetup":count>0,"isAuthenticated":authenticated,"authenticated":authenticated,"registrationEnabled":registration,"userCount":count}),
    )
}
async fn username_check(
    State(app): State<App>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let username = q.get("username").map(|s| s.trim()).unwrap_or("");
    if username.len() < 3 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Username must be at least 3 characters","available":false})),
        )
            .into_response();
    }
    let exists: bool = db(&app)
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM profiles WHERE LOWER(username)=LOWER(?1))",
            [username],
            |r| r.get(0),
        )
        .unwrap_or(true);
    Json(json!({"available":!exists})).into_response()
}
fn validate_auth(input: &AuthInput, login: bool) -> Result<(), Response> {
    if input.username.is_empty()
        || input.password.is_empty()
        || (!login
            && (input.username.len() < 3
                || input.username.len() > 32
                || !input
                    .username
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
                || input.password.len() < 8
                || input.password.len() > 128
                || input.display_name.as_ref().is_some_and(|s| s.len() > 64)))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response());
    }
    Ok(())
}
async fn setup(State(app): State<App>, ApiJson(input): ApiJson<AuthInput>) -> Response {
    if let Err(response) = validate_auth(&input, false) {
        return response;
    }
    let conn = db(&app);
    let count: i64 = conn
        .query_row("SELECT count(*) FROM profiles", [], |r| r.get(0))
        .unwrap_or(0);
    if count > 0 {
        return error(StatusCode::CONFLICT, "App is already set up");
    }
    create_account(&app, input, "admin")
}
async fn register(State(app): State<App>, ApiJson(input): ApiJson<AuthInput>) -> Response {
    let registration = db(&app)
        .query_row(
            "SELECT value FROM system_settings WHERE key='registration_enabled'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()
        .map(|v| v == "true" || v == "1")
        .unwrap_or_else(|| {
            env::var("ALLOW_REGISTRATION")
                .map(|v| v != "false" && v != "0")
                .unwrap_or(true)
        });
    if !registration {
        return error(
            StatusCode::FORBIDDEN,
            "Registration is currently disabled by administrator",
        );
    }
    if let Err(response) = validate_auth(&input, false) {
        return response;
    }
    let exists: bool = db(&app)
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM profiles WHERE LOWER(username)=LOWER(?1))",
            [&input.username],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if exists {
        return error(StatusCode::CONFLICT, "Username is already taken");
    }
    let count: i64 = db(&app)
        .query_row("SELECT count(*) FROM profiles", [], |r| r.get(0))
        .unwrap_or(0);
    create_account(&app, input, if count == 0 { "admin" } else { "user" })
}
fn create_account(app: &App, input: AuthInput, role: &str) -> Response {
    let id = new_id();
    // Argon2id defaults match the existing backend's 64 MiB / 3 iterations / 4 lanes.
    let salt = argon2::password_hash::SaltString::generate(&mut rand::thread_rng());
    let params = argon2::Params::new(65536, 3, 4, None).expect("valid argon parameters");
    let argon = Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, params);
    let hash = match argon.hash_password(input.password.as_bytes(), &salt) {
        Ok(h) => h.to_string(),
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"),
    };
    let result = db(app).execute(
        "INSERT INTO profiles(id,username,password_hash,display_name,role) VALUES(?1,?2,?3,?4,?5)",
        params![id, input.username, hash, input.display_name, role],
    );
    if result.is_err() {
        return error(StatusCode::CONFLICT, "Username is already taken");
    }
    let session = match set_session(app, &id) {
        Ok(s) => s,
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"),
    };
    let body = Json(
        json!({"id":id,"username":input.username,"displayName":input.display_name,"role":role}),
    )
    .into_response();
    let response = (StatusCode::CREATED, body).into_response();
    with_cookie(response, session_cookie(&session, app.production))
}
async fn login(State(app): State<App>, ApiJson(input): ApiJson<AuthInput>) -> Response {
    if input.username.is_empty() || input.password.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let row = db(&app)
        .query_row(
            "SELECT id,password_hash FROM profiles WHERE username=?1",
            [&input.username],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()
        .ok()
        .flatten();
    let Some((id, stored)) = row else {
        return error(StatusCode::UNAUTHORIZED, "Invalid credentials");
    };
    let valid = PasswordHash::new(&stored)
        .ok()
        .and_then(|parsed| {
            Argon2::default()
                .verify_password(input.password.as_bytes(), &parsed)
                .ok()
        })
        .is_some();
    if !valid {
        return error(StatusCode::UNAUTHORIZED, "Invalid credentials");
    }
    let session = match set_session(&app, &id) {
        Ok(s) => s,
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"),
    };
    with_cookie(
        Json(json!({"ok":true})).into_response(),
        session_cookie(&session, app.production),
    )
}
async fn logout(State(app): State<App>, headers: axum::http::HeaderMap) -> Response {
    if let Some(cookie) = headers.get(header::COOKIE).and_then(|v| v.to_str().ok()) {
        if let Some(id) = cookie
            .split(';')
            .filter_map(|p| p.trim().split_once('='))
            .find(|(k, _)| *k == "session_id")
            .map(|(_, v)| v)
        {
            let _ = db(&app).execute("DELETE FROM sessions WHERE id=?1", [id]);
        }
    }
    let mut res = Json(json!({"ok":true})).into_response();
    let value = format!(
        "session_id=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0{}",
        if app.production { "; Secure" } else { "" }
    );
    if let Ok(v) = HeaderValue::from_str(&value) {
        res.headers_mut().append(header::SET_COOKIE, v);
    }
    res
}
async fn me(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let user = json!({"id":p.id,"username":p.username,"displayName":p.display_name,"display_name":p.display_name,"avatar_url":p.avatar_url,"avatarUrl":p.avatar_url,"bio":p.bio,"role":p.role,"is_public":p.is_public,"isPublic":p.is_public,"created_at":p.created_at,"createdAt":p.created_at});
    let mut result = user.as_object().cloned().unwrap_or_default();
    result.insert("authenticated".into(), json!(true));
    result.insert("user".into(), user);
    Json(Value::Object(result)).into_response()
}

#[derive(Deserialize)]
struct WeightInput {
    value: Option<f64>,
    weight: Option<f64>,
    unit: Option<String>,
    recorded_at: Option<String>,
    date: Option<String>,
    notes: Option<String>,
}
async fn weight_list(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    if q.get("limit").is_some_and(|v| v.parse::<i64>().is_err())
        || q.get("offset").is_some_and(|v| v.parse::<i64>().is_err())
        || q.get("paginate")
            .is_some_and(|v| !["true", "false", "1", "0"].contains(&v.as_str()))
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let limit = q
        .get("limit")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(500);
    let offset = q
        .get("offset")
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);
    if !(1..=500).contains(&limit) || offset < 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let conn = db(&app);
    let mut stmt=match conn.prepare("SELECT id,profile_id,value,unit,recorded_at,notes,created_at,updated_at FROM weight_entries WHERE profile_id=?1 AND (?2 IS NULL OR recorded_at>=?2) AND (?3 IS NULL OR recorded_at<=?3) ORDER BY recorded_at DESC LIMIT ?4 OFFSET ?5") {Ok(s)=>s,Err(_)=>return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")};
    let rows=stmt.query_map(params![p.id,q.get("from"),q.get("to"),limit,offset],|r|Ok(json!({"id":r.get::<_,String>(0)?,"profile_id":r.get::<_,String>(1)?,"value":r.get::<_,f64>(2)?,"unit":r.get::<_,String>(3)?,"recorded_at":r.get::<_,String>(4)?,"notes":r.get::<_,Option<String>>(5)?,"created_at":r.get::<_,String>(6)?,"updated_at":r.get::<_,String>(7)?}))).ok().map(|it|it.filter_map(Result::ok).collect::<Vec<_>>()).unwrap_or_default();
    let rows: Vec<Value> = rows
        .into_iter()
        .map(|mut e| {
            if let Some(m) = e.as_object_mut() {
                let date = m
                    .get("recorded_at")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .split('T')
                    .next()
                    .unwrap_or("")
                    .to_owned();
                let value = m.get("value").and_then(Value::as_f64).unwrap_or(0.0);
                let is_lbs = m.get("unit").and_then(Value::as_str) == Some("lbs");
                m.insert("date".into(), json!(date));
                m.insert(
                    "weight".into(),
                    json!(if is_lbs { value / 2.20462 } else { value }),
                );
            }
            e
        })
        .collect();
    if q.get("paginate").is_some_and(|v| v == "true" || v == "1") {
        let total:i64=conn.query_row("SELECT count(*) FROM weight_entries WHERE profile_id=?1 AND (?2 IS NULL OR recorded_at>=?2) AND (?3 IS NULL OR recorded_at<=?3)",params![p.id,q.get("from"),q.get("to")],|r|r.get(0)).unwrap_or(0);
        Json(json!({"entries":rows,"total":total,"limit":limit,"offset":offset})).into_response()
    } else {
        Json(json!(rows)).into_response()
    }
}
async fn weight_stats(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let mut stmt=match conn.prepare("SELECT value,unit,recorded_at FROM weight_entries WHERE profile_id=?1 ORDER BY recorded_at ASC"){Ok(s)=>s,Err(_)=>return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")};
    let rows = stmt
        .query_map([p.id], |r| {
            Ok((
                r.get::<_, f64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .ok()
        .map(|it| it.filter_map(Result::ok).collect::<Vec<_>>())
        .unwrap_or_default();
    if rows.is_empty() {
        return Json(json!({"currentWeight":null,"startingWeight":null,"totalChange":null,"percentChange":null,"weeklyAvg":null,"trend":null})).into_response();
    }
    let kg = |r: &(f64, String, String)| if r.1 == "lbs" { r.0 / 2.20462 } else { r.0 };
    let vals: Vec<f64> = rows.iter().map(kg).collect();
    let first = vals[0];
    let last = *vals.last().unwrap();
    let total = rounded(last - first, 2);
    let pct = rounded((last - first) / first * 100.0, 2);
    let mut weeks = BTreeMap::<(i32, u32), Vec<f64>>::new();
    for (i, r) in rows.iter().enumerate() {
        if let Some(d) = chrono::DateTime::parse_from_rfc3339(&r.2).ok() {
            weeks
                .entry((d.iso_week().year(), d.iso_week().week()))
                .or_default()
                .push(vals[i]);
        }
    }
    let weekly = if weeks.is_empty() {
        Value::Null
    } else {
        let avgs: Vec<f64> = weeks
            .values()
            .map(|v| v.iter().sum::<f64>() / v.len() as f64)
            .collect();
        json!(rounded(avgs.iter().sum::<f64>() / avgs.len() as f64, 2))
    };
    let trend = if rows.len() < 2 {
        Value::Null
    } else {
        let t0 = datetime_ms(&rows[0].2).unwrap_or(0) as f64;
        let points: Vec<(f64, f64)> = rows
            .iter()
            .enumerate()
            .map(|(i, r)| {
                (
                    (datetime_ms(&r.2).unwrap_or(0) as f64 - t0) / 86400000.0,
                    vals[i],
                )
            })
            .collect();
        let n = points.len() as f64;
        let sx = points.iter().map(|p| p.0).sum::<f64>();
        let sy = points.iter().map(|p| p.1).sum::<f64>();
        let sxy = points.iter().map(|p| p.0 * p.1).sum::<f64>();
        let sx2 = points.iter().map(|p| p.0 * p.0).sum::<f64>();
        let den = n * sx2 - sx * sx;
        json!(if den != 0.0 {
            rounded((n * sxy - sx * sy) / den, 4)
        } else {
            0.0
        })
    };
    Json(json!({"currentWeight":{"value":last,"unit":"kg","recorded_at":rows.last().unwrap().2},"startingWeight":{"value":first,"unit":"kg","recorded_at":rows[0].2},"totalChange":total,"percentChange":pct,"weeklyAvg":weekly,"trend":trend})).into_response()
}
async fn weight_create(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<WeightInput>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let Some(value) = input
        .value
        .or(input.weight)
        .filter(|v| v.is_finite() && *v > 0.0)
    else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    };
    let Some(date) = input.recorded_at.or(input.date) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    };
    let unit = input.unit.unwrap_or("kg".into());
    if unit != "kg" && unit != "lbs" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    };
    if input.notes.as_ref().is_some_and(|s| s.len() > 500) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let conn = db(&app);
    let existing=conn.query_row("SELECT id,profile_id,value,unit,recorded_at,notes,created_at,updated_at FROM weight_entries WHERE profile_id=?1 AND recorded_at=?2",params![p.id,date],|r|Ok(json!({"id":r.get::<_,String>(0)?,"profile_id":r.get::<_,String>(1)?,"value":r.get::<_,f64>(2)?,"unit":r.get::<_,String>(3)?,"recorded_at":r.get::<_,String>(4)?,"notes":r.get::<_,Option<String>>(5)?,"created_at":r.get::<_,String>(6)?,"updated_at":r.get::<_,String>(7)?}))).optional().ok().flatten();
    if let Some(existing) = existing {
        return (
            StatusCode::CONFLICT,
            Json(
                json!({"error":"Entry already exists for this date and time","existing":existing}),
            ),
        )
            .into_response();
    }
    let id = new_id();
    if conn.execute("INSERT INTO weight_entries(id,profile_id,value,unit,recorded_at,notes) VALUES(?1,?2,?3,?4,?5,?6)",params![id,p.id,value,unit,date,input.notes]).is_err(){return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")};
    let mut result=conn.query_row("SELECT id,profile_id,value,unit,recorded_at,notes,created_at,updated_at FROM weight_entries WHERE id=?1",[id],|r|Ok(json!({"id":r.get::<_,String>(0)?,"profile_id":r.get::<_,String>(1)?,"value":r.get::<_,f64>(2)?,"unit":r.get::<_,String>(3)?,"recorded_at":r.get::<_,String>(4)?,"notes":r.get::<_,Option<String>>(5)?,"created_at":r.get::<_,String>(6)?,"updated_at":r.get::<_,String>(7)?}))).unwrap_or(Value::Null);
    if let Some(m) = result.as_object_mut() {
        m.insert("date".into(), json!(date.split('T').next().unwrap_or("")));
        m.insert(
            "weight".into(),
            json!(if unit == "lbs" {
                value / 2.20462
            } else {
                value
            }),
        );
    }
    (StatusCode::CREATED, Json(result)).into_response()
}
async fn weight_update(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM weight_entries WHERE id=?1 AND profile_id=?2)",
            params![id, p.id],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if !exists {
        return error(StatusCode::NOT_FOUND, "Entry not found");
    }
    let get_number = |keys: &[&str]| {
        keys.iter()
            .find_map(|k| input.get(*k).and_then(Value::as_f64))
    };
    let value = get_number(&["value", "weight"]);
    if value.is_some_and(|v| !v.is_finite() || v <= 0.0) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let unit = input.get("unit").and_then(Value::as_str);
    if unit.is_some_and(|u| u != "kg" && u != "lbs") {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let date = input.get("recorded_at").and_then(Value::as_str);
    let notes = input.get("notes");
    if notes.and_then(Value::as_str).is_some_and(|s| s.len() > 500) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let conflict = if let Some(d) = date {
        conn.query_row("SELECT EXISTS(SELECT 1 FROM weight_entries WHERE profile_id=?1 AND recorded_at=?2 AND id<>?3)",params![p.id,d,id],|r|r.get::<_,bool>(0)).unwrap_or(false)
    } else {
        false
    };
    if conflict {
        return error(
            StatusCode::CONFLICT,
            "Another entry already exists for this date and time",
        );
    }
    let note_value = notes.and_then(|v| {
        if v.is_null() {
            Some(None)
        } else {
            v.as_str().map(|s| Some(s.to_owned()))
        }
    });
    let _=conn.execute("UPDATE weight_entries SET value=COALESCE(?1,value),unit=COALESCE(?2,unit),recorded_at=COALESCE(?3,recorded_at),notes=CASE WHEN ?4 THEN ?5 ELSE notes END,updated_at=datetime('now') WHERE id=?6 AND profile_id=?7",params![value,unit,date,notes.is_some(),note_value.flatten(),id,p.id]);
    let row=conn.query_row("SELECT id,profile_id,value,unit,recorded_at,notes,created_at,updated_at FROM weight_entries WHERE id=?1",[id],|r|Ok(json!({"id":r.get::<_,String>(0)?,"profile_id":r.get::<_,String>(1)?,"value":r.get::<_,f64>(2)?,"unit":r.get::<_,String>(3)?,"recorded_at":r.get::<_,String>(4)?,"notes":r.get::<_,Option<String>>(5)?,"created_at":r.get::<_,String>(6)?,"updated_at":r.get::<_,String>(7)?}))).unwrap_or(Value::Null);
    Json(row).into_response()
}
async fn weight_delete(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    if db(&app)
        .execute(
            "DELETE FROM weight_entries WHERE id=?1 AND profile_id=?2",
            params![id, p.id],
        )
        .unwrap_or(0)
        == 0
    {
        return error(StatusCode::NOT_FOUND, "Entry not found");
    }
    Json(json!({"ok":true})).into_response()
}

fn goals_response(app: &App, profile_id: &str) -> Response {
    let row=db(app).query_row("SELECT id,profile_id,starting_weight,starting_weight_unit,target_weight,target_weight_unit,target_date,notes,created_at,updated_at FROM goals WHERE profile_id=?1 ORDER BY updated_at DESC LIMIT 1",[profile_id],|r|Ok(json!({"id":r.get::<_,String>(0)?,"profile_id":r.get::<_,String>(1)?,"starting_weight":r.get::<_,Option<f64>>(2)?,"starting_weight_unit":r.get::<_,String>(3)?,"target_weight":r.get::<_,Option<f64>>(4)?,"target_weight_unit":r.get::<_,String>(5)?,"target_date":r.get::<_,Option<String>>(6)?,"notes":r.get::<_,Option<String>>(7)?,"created_at":r.get::<_,String>(8)?,"updated_at":r.get::<_,String>(9)?}))).optional().ok().flatten();
    if let Some(mut g) = row {
        if let Some(m) = g.as_object_mut() {
            m.insert(
                "startWeight".into(),
                m.get("starting_weight").cloned().unwrap_or(Value::Null),
            );
            m.insert(
                "targetWeight".into(),
                m.get("target_weight").cloned().unwrap_or(Value::Null),
            );
            m.insert(
                "targetDate".into(),
                m.get("target_date").cloned().unwrap_or(Value::Null),
            );
            m.insert("isActive".into(), json!(true));
        }
        Json(g).into_response()
    } else {
        Json(Value::Null).into_response()
    }
}
async fn goals_get(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    goals_response(&app, &p.id)
}
async fn goals_save(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let number = |keys: &[&str]| {
        keys.iter()
            .find_map(|k| input.get(*k).and_then(Value::as_f64))
    };
    let starting = number(&["starting_weight", "startWeight"]);
    let target = number(&["target_weight", "targetWeight"]);
    if starting.is_some_and(|v| !v.is_finite() || v <= 0.0)
        || target.is_some_and(|v| !v.is_finite() || v <= 0.0)
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let unit1 = input
        .get("starting_weight_unit")
        .and_then(Value::as_str)
        .unwrap_or("kg");
    let unit2 = input
        .get("target_weight_unit")
        .and_then(Value::as_str)
        .unwrap_or("kg");
    let date = input
        .get("target_date")
        .or_else(|| input.get("targetDate"))
        .and_then(Value::as_str);
    let notes = input.get("notes").and_then(Value::as_str);
    if ![unit1, unit2].iter().all(|u| *u == "kg" || *u == "lbs")
        || notes.is_some_and(|s| s.len() > 500)
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let conn = db(&app);
    let existing = conn
        .query_row("SELECT id FROM goals WHERE profile_id=?1", [&p.id], |r| {
            r.get::<_, String>(0)
        })
        .optional()
        .ok()
        .flatten();
    let created = if let Some(id) = existing {
        let _=conn.execute("UPDATE goals SET starting_weight=COALESCE(?1,starting_weight),starting_weight_unit=COALESCE(?2,starting_weight_unit),target_weight=COALESCE(?3,target_weight),target_weight_unit=COALESCE(?4,target_weight_unit),target_date=COALESCE(?5,target_date),notes=COALESCE(?6,notes),updated_at=datetime('now') WHERE id=?7",params![starting,input.get("starting_weight_unit").and_then(Value::as_str),target,input.get("target_weight_unit").and_then(Value::as_str),date,notes,id]);
        false
    } else {
        let id = new_id();
        if conn.execute("INSERT INTO goals(id,profile_id,starting_weight,starting_weight_unit,target_weight,target_weight_unit,target_date,notes) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![id,p.id,starting,unit1,target,unit2,date,notes]).is_err(){return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")}
        true
    };
    drop(conn);
    let mut response = goals_response(&app, &p.id);
    if created {
        let (mut parts, body) = response.into_parts();
        parts.status = StatusCode::CREATED;
        response = Response::from_parts(parts, body)
    }
    response
}
async fn settings_get(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let mut stmt = match conn.prepare("SELECT key,value FROM settings WHERE profile_id=?1") {
        Ok(s) => s,
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"),
    };
    let values = stmt
        .query_map([p.id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .ok()
        .map(|i| {
            i.filter_map(Result::ok)
                .collect::<std::collections::HashMap<_, _>>()
        })
        .unwrap_or_default();
    Json(values).into_response()
}
async fn settings_put(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let Some(obj) = input.as_object() else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    };
    let valid = ["unit_system", "height_cm", "sex", "date_of_birth"];
    for (k, v) in obj {
        let Some(value) = v.as_str() else {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error":"Validation failed","issues":[]})),
            )
                .into_response();
        };
        if !valid.contains(&k.as_str()) {
            return (StatusCode::BAD_REQUEST,Json(json!({"error":"Validation failed","issues":[{"message":"Unknown setting key(s)"}]}))).into_response();
        }
        let ok = match k.as_str() {
            "unit_system" => ["metric", "imperial"].contains(&value),
            "sex" => ["male", "female", "other"].contains(&value),
            "height_cm" => value.parse::<f64>().is_ok(),
            "date_of_birth" => chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok(),
            _ => false,
        };
        if !ok {
            return (StatusCode::BAD_REQUEST,Json(json!({"error":"Validation failed","issues":[{"key":k,"message":"Invalid value"}]}))).into_response();
        }
    }
    let mut conn = db(&app);
    {
        let tx = match conn.transaction() {
            Ok(t) => t,
            Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"),
        };
        for (k, v) in obj {
            let _=tx.execute("INSERT INTO settings(id,profile_id,key,value) VALUES(?1,?2,?3,?4) ON CONFLICT(profile_id,key) DO UPDATE SET value=excluded.value",params![new_id(),p.id,k,v.as_str().unwrap_or("")]);
        }
        if tx.commit().is_err() {
            return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
        }
    }
    let mut stmt = match conn.prepare("SELECT key,value FROM settings WHERE profile_id=?1") {
        Ok(s) => s,
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"),
    };
    let values = stmt
        .query_map([p.id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .ok()
        .map(|i| {
            i.filter_map(Result::ok)
                .collect::<std::collections::HashMap<_, _>>()
        })
        .unwrap_or_default();
    Json(values).into_response()
}

fn measurement_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    Ok(
        json!({"id":r.get::<_,String>(0)?,"profile_id":r.get::<_,String>(1)?,"definition_id":r.get::<_,String>(2)?,"value":r.get::<_,f64>(3)?,"recorded_at":r.get::<_,String>(4)?,"notes":r.get::<_,Option<String>>(5)?,"created_at":r.get::<_,String>(6)?,"updated_at":r.get::<_,String>(7)?}),
    )
}
fn normalized_date(raw: Option<&str>) -> String {
    let Some(raw) = raw else {
        return Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    };
    let s = raw.trim();
    if s.len() == 10 {
        if s == Utc::now().format("%Y-%m-%d").to_string() {
            return Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        }
        return format!("{s}T12:00:00.000Z");
    }
    if s.len() == 16 && !s.contains('Z') {
        return format!("{s}:00.000Z");
    }
    if s.len() == 19 && !s.contains('Z') {
        return format!("{s}.000Z");
    }
    chrono::DateTime::parse_from_rfc3339(s)
        .map(|d| {
            d.with_timezone(&Utc)
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
        })
        .unwrap_or_else(|_| s.into())
}
async fn definitions_get(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let mut stmt=match conn.prepare("SELECT id,profile_id,name,slug,unit,is_system,display_order,created_at FROM measurement_definitions WHERE is_system=1 OR profile_id=?1 ORDER BY is_system DESC,display_order ASC,name ASC"){Ok(s)=>s,Err(_)=>return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")};
    let rows=stmt.query_map([p.id],|r|Ok(json!({"id":r.get::<_,String>(0)?,"profile_id":r.get::<_,Option<String>>(1)?,"name":r.get::<_,String>(2)?,"slug":r.get::<_,String>(3)?,"unit":r.get::<_,String>(4)?,"is_system":r.get::<_,i64>(5)?,"display_order":r.get::<_,i64>(6)?,"created_at":r.get::<_,String>(7)?}))).ok().map(|it|it.filter_map(Result::ok).collect::<Vec<_>>()).unwrap_or_default();
    Json(rows).into_response()
}
async fn definitions_create(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let name = input.get("name").and_then(Value::as_str).unwrap_or("");
    let unit = input.get("unit").and_then(Value::as_str).unwrap_or("");
    if name.is_empty() || name.len() > 64 || unit.is_empty() || unit.len() > 16 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let slug = name
        .to_lowercase()
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("_");
    let conn = db(&app);
    let order:i64=conn.query_row("SELECT COALESCE(MAX(display_order),100)+1 FROM measurement_definitions WHERE profile_id=?1",[&p.id],|r|r.get(0)).unwrap_or(101);
    let id = new_id();
    if conn.execute("INSERT INTO measurement_definitions(id,profile_id,name,slug,unit,is_system,display_order) VALUES(?1,?2,?3,?4,?5,0,?6)",params![id,p.id,name,slug,unit,order]).is_err(){return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")}
    let row=conn.query_row("SELECT id,profile_id,name,slug,unit,is_system,display_order,created_at FROM measurement_definitions WHERE id=?1",[id],|r|Ok(json!({"id":r.get::<_,String>(0)?,"profile_id":r.get::<_,Option<String>>(1)?,"name":r.get::<_,String>(2)?,"slug":r.get::<_,String>(3)?,"unit":r.get::<_,String>(4)?,"is_system":r.get::<_,i64>(5)?,"display_order":r.get::<_,i64>(6)?,"created_at":r.get::<_,String>(7)?}))).unwrap_or(Value::Null);
    (StatusCode::CREATED, Json(row)).into_response()
}
async fn definitions_delete(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let row = conn
        .query_row(
            "SELECT profile_id,is_system FROM measurement_definitions WHERE id=?1",
            [&id],
            |r| Ok((r.get::<_, Option<String>>(0)?, r.get::<_, i64>(1)?)),
        )
        .optional()
        .ok()
        .flatten();
    let Some((owner, system)) = row else {
        return error(StatusCode::NOT_FOUND, "Definition not found");
    };
    if system != 0 {
        return error(
            StatusCode::FORBIDDEN,
            "Cannot delete system measurement definitions",
        );
    }
    if owner.as_deref() != Some(&p.id) {
        return error(StatusCode::FORBIDDEN, "Forbidden");
    }
    let _ = conn.execute("DELETE FROM measurement_definitions WHERE id=?1", [id]);
    Json(json!({"ok":true})).into_response()
}
async fn measurement_entries(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let mut stmt=match conn.prepare("SELECT me.id,me.profile_id,me.definition_id,me.value,me.recorded_at,me.notes,me.created_at,me.updated_at,md.name,md.slug,md.unit,md.is_system,md.display_order FROM measurement_entries me LEFT JOIN measurement_definitions md ON md.id=me.definition_id WHERE me.profile_id=?1 AND (?2 IS NULL OR me.definition_id=?2) AND (?3 IS NULL OR me.recorded_at>=?3) AND (?4 IS NULL OR me.recorded_at<=?4) ORDER BY me.recorded_at DESC,me.created_at DESC"){Ok(s)=>s,Err(_)=>return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")};
    let to = q.get("to").map(|s| {
        if s.len() == 10 {
            format!("{s}T23:59:59.999Z")
        } else {
            s.clone()
        }
    });
    let rows=stmt.query_map(params![p.id,q.get("definition_id"),q.get("from"),to],|r|{let mut v=measurement_row(r)?;if let Some(m)=v.as_object_mut(){let recorded=m.get("recorded_at").and_then(Value::as_str).unwrap_or("").to_owned();m.insert("date".into(),json!(recorded.split('T').next().unwrap_or("")));m.insert("definitionId".into(),m.get("definition_id").cloned().unwrap_or(Value::Null));m.insert("name".into(),r.get::<_,Option<String>>(8)?.map(Value::String).unwrap_or(Value::Null));m.insert("slug".into(),r.get::<_,Option<String>>(9)?.map(Value::String).unwrap_or(Value::Null));m.insert("unit".into(),r.get::<_,Option<String>>(10)?.map(Value::String).unwrap_or(Value::Null));m.insert("is_system".into(),r.get::<_,Option<i64>>(11)?.map(Value::from).unwrap_or(Value::Null));m.insert("display_order".into(),r.get::<_,Option<i64>>(12)?.map(Value::from).unwrap_or(Value::Null));m.insert("definition".into(),json!({"id":m.get("definition_id").cloned().unwrap_or(Value::Null),"name":m.get("name").cloned().unwrap_or(Value::Null),"slug":m.get("slug").cloned().unwrap_or(Value::Null),"unit":m.get("unit").cloned().unwrap_or(Value::Null)}));}Ok(v)}).ok().map(|it|it.filter_map(Result::ok).collect::<Vec<_>>()).unwrap_or_default();
    Json(rows).into_response()
}
async fn measurement_latest(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let mut stmt=match conn.prepare("SELECT me.id,me.profile_id,me.definition_id,me.value,me.recorded_at,me.notes,me.created_at,me.updated_at,md.name,md.slug,md.unit FROM measurement_entries me JOIN measurement_definitions md ON md.id=me.definition_id WHERE me.profile_id=?1 AND me.id=(SELECT m2.id FROM measurement_entries m2 WHERE m2.profile_id=me.profile_id AND m2.definition_id=me.definition_id ORDER BY m2.recorded_at DESC,m2.created_at DESC LIMIT 1) ORDER BY md.display_order,md.name"){Ok(s)=>s,Err(_)=>return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")};
    let rows = stmt
        .query_map([p.id], |r| {
            let mut v = measurement_row(r)?;
            let date = v
                .get("recorded_at")
                .and_then(Value::as_str)
                .unwrap_or("")
                .split('T')
                .next()
                .unwrap_or("")
                .to_owned();
            v.as_object_mut()
                .unwrap()
                .insert("date".into(), json!(date));
            let object = v.as_object_mut().unwrap();
            object.insert("definition_name".into(), r.get::<_, String>(8)?.into());
            object.insert("slug".into(), r.get::<_, String>(9)?.into());
            object.insert("definition_unit".into(), r.get::<_, String>(10)?.into());
            Ok(v)
        })
        .ok()
        .map(|it| it.filter_map(Result::ok).collect::<Vec<_>>())
        .unwrap_or_default();
    Json(rows).into_response()
}
async fn measurement_create(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let entries = input.get("entries").cloned().unwrap_or(input);
    let Some(items) = entries.as_array() else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    };
    if items.is_empty() || items.len() > 50 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let mut conn = db(&app);
    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"),
    };
    let mut created = vec![];
    for item in items {
        let def = item
            .get("definition_id")
            .or_else(|| item.get("definitionId"))
            .map(|v| v.to_string().trim_matches('"').to_owned())
            .unwrap_or_default();
        let Some(value) = item.get("value").and_then(Value::as_f64) else {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error":"Validation failed","issues":[]})),
            )
                .into_response();
        };
        let rec = normalized_date(
            item.get("recorded_at")
                .or_else(|| item.get("date"))
                .and_then(Value::as_str),
        );
        if item
            .get("notes")
            .is_some_and(|n| !n.is_null() && n.as_str().is_none_or(|s| s.len() > 500))
        {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error":"Validation failed","issues":[]})),
            )
                .into_response();
        }
        let exists:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM measurement_definitions WHERE id=?1 AND (is_system=1 OR profile_id=?2))",params![def,p.id],|r|r.get(0)).unwrap_or(false);
        if !exists {
            return error(
                StatusCode::NOT_FOUND,
                &format!("Definition not found: {def}"),
            );
        }
        let id = new_id();
        if tx.execute("INSERT INTO measurement_entries(id,profile_id,definition_id,value,recorded_at,notes) VALUES(?1,?2,?3,?4,?5,?6)",params![id,p.id,def,value,rec,item.get("notes").and_then(Value::as_str)]).is_err(){return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal error")}
        let mut row=tx.query_row("SELECT id,profile_id,definition_id,value,recorded_at,notes,created_at,updated_at FROM measurement_entries WHERE id=?1",[&id],measurement_row).unwrap_or(Value::Null);
        if let Some(m) = row.as_object_mut() {
            let recorded = m
                .get("recorded_at")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            m.insert(
                "date".into(),
                json!(recorded.split('T').next().unwrap_or("")),
            );
            m.insert(
                "definitionId".into(),
                m.get("definition_id").cloned().unwrap_or(Value::Null),
            );
        }
        created.push(row);
    }
    if tx.commit().is_err() {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal error");
    }
    (StatusCode::CREATED, Json(json!(created))).into_response()
}
async fn measurement_delete(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    if db(&app)
        .execute(
            "DELETE FROM measurement_entries WHERE id=?1 AND profile_id=?2",
            params![id, p.id],
        )
        .unwrap_or(0)
        == 0
    {
        return error(StatusCode::NOT_FOUND, "Entry not found");
    }
    Json(json!({"ok":true})).into_response()
}
async fn measurement_update(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM measurement_entries WHERE id=?1 AND profile_id=?2)",
            params![id, p.id],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if !exists {
        return error(StatusCode::NOT_FOUND, "Entry not found");
    }
    let value = input.get("value").and_then(Value::as_f64);
    let date = input
        .get("recorded_at")
        .and_then(Value::as_str)
        .map(|s| normalized_date(Some(s)));
    let notes = input.get("notes");
    if notes.and_then(Value::as_str).is_some_and(|s| s.len() > 500) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let note = notes.and_then(|n| {
        if n.is_null() {
            Some(None)
        } else {
            n.as_str().map(|s| Some(s.to_owned()))
        }
    });
    let _=conn.execute("UPDATE measurement_entries SET value=COALESCE(?1,value),recorded_at=COALESCE(?2,recorded_at),notes=CASE WHEN ?3 THEN ?4 ELSE notes END,updated_at=datetime('now') WHERE id=?5 AND profile_id=?6",params![value,date,notes.is_some(),note.flatten(),id,p.id]);
    Json(conn.query_row("SELECT id,profile_id,definition_id,value,recorded_at,notes,created_at,updated_at FROM measurement_entries WHERE id=?1",[id],measurement_row).unwrap_or(Value::Null)).into_response()
}
async fn measurement_batch_upsert(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let Some(entries) = input.get("entries").and_then(Value::as_array) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    };
    if entries.is_empty()
        || entries.len() > 100
        || entries.iter().any(|e| {
            e.get("value").and_then(Value::as_f64).is_none()
                || (e.get("id").and_then(Value::as_str).is_none()
                    && e.get("definition_id").and_then(Value::as_str).is_none())
        })
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let mut conn = db(&app);
    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"),
    };
    let mut result = Vec::new();
    for entry in entries {
        let value = entry["value"].as_f64().unwrap_or(0.0);
        let date = entry
            .get("recorded_at")
            .or_else(|| entry.get("date"))
            .and_then(Value::as_str)
            .map(|s| normalized_date(Some(s)));
        if let Some(id) = entry.get("id").and_then(Value::as_str) {
            let old = tx
                .query_row(
                    "SELECT recorded_at FROM measurement_entries WHERE id=?1 AND profile_id=?2",
                    params![id, p.id],
                    |r| r.get::<_, String>(0),
                )
                .optional()
                .ok()
                .flatten();
            let Some(old_date) = old else {
                return error(StatusCode::NOT_FOUND, "Entry not found");
            };
            let rec = date.as_deref().unwrap_or(&old_date);
            let _=tx.execute("UPDATE measurement_entries SET value=?1,recorded_at=?2,updated_at=datetime('now') WHERE id=?3 AND profile_id=?4",params![value,rec,id,p.id]);
            let row=tx.query_row("SELECT id,profile_id,definition_id,value,recorded_at,notes,created_at,updated_at FROM measurement_entries WHERE id=?1",[id],measurement_row).unwrap_or(Value::Null);
            result.push(row);
        } else {
            let def = entry["definition_id"].as_str().unwrap_or("");
            let valid:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM measurement_definitions WHERE id=?1 AND (is_system=1 OR profile_id=?2))",params![def,p.id],|r|r.get(0)).unwrap_or(false);
            if !valid {
                return error(
                    StatusCode::NOT_FOUND,
                    &format!("Definition not found: {def}"),
                );
            }
            let id = new_id();
            let rec = date.unwrap_or_else(|| normalized_date(None));
            if tx.execute("INSERT INTO measurement_entries(id,profile_id,definition_id,value,recorded_at,notes) VALUES(?1,?2,?3,?4,?5,NULL)",params![id,p.id,def,value,rec]).is_err(){return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal error")}
            result.push(tx.query_row("SELECT id,profile_id,definition_id,value,recorded_at,notes,created_at,updated_at FROM measurement_entries WHERE id=?1",[id],measurement_row).unwrap_or(Value::Null));
        }
    }
    if tx.commit().is_err() {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal error");
    }
    Json(result).into_response()
}
async fn profile_get(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    Json(json!(p)).into_response()
}
async fn profile_update(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let display = input
        .get("display_name")
        .or_else(|| input.get("displayName"));
    let bio = input.get("bio");
    let public = input.get("is_public").or_else(|| input.get("isPublic"));
    if display
        .and_then(Value::as_str)
        .is_some_and(|s| s.len() > 64)
        || bio.and_then(Value::as_str).is_some_and(|s| s.len() > 256)
        || public.is_some_and(|v| !v.is_boolean())
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let conn = db(&app);
    let _ = conn.execute(
        "UPDATE profiles SET display_name=?1,bio=?2,is_public=?3 WHERE id=?4",
        params![
            match display {
                Some(v) if v.is_null() => None,
                Some(v) => v.as_str().map(str::to_owned),
                None => p.display_name,
            },
            match bio {
                Some(v) if v.is_null() => None,
                Some(v) => v.as_str().map(str::to_owned),
                None => p.bio,
            },
            public
                .and_then(Value::as_bool)
                .map(i64::from)
                .unwrap_or(i64::from(p.is_public)),
            p.id
        ],
    );
    drop(conn);
    let updated = current_profile(&app, &session);
    Json(updated).into_response()
}
async fn public_profile(
    State(app): State<App>,
    RoutePath(username): RoutePath<String>,
) -> Response {
    let clean = username.strip_prefix('@').unwrap_or(&username).trim();
    let conn = db(&app);
    let profile=conn.query_row("SELECT id,username,display_name,avatar_url,bio,is_public,created_at FROM profiles WHERE LOWER(username)=LOWER(?1)",[clean],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,Option<String>>(2)?,r.get::<_,Option<String>>(3)?,r.get::<_,Option<String>>(4)?,r.get::<_,i64>(5)?,r.get::<_,String>(6)?))).optional().ok().flatten();
    let Some((id, username, display_name, avatar_url, bio, is_public, created_at)) = profile else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error":"Profile is private or does not exist","is_public":false})),
        )
            .into_response();
    };
    if is_public == 0 {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error":"Profile is private or does not exist","is_public":false})),
        )
            .into_response();
    }
    let mut stmt=conn.prepare("SELECT recorded_at,value FROM weight_entries WHERE profile_id=?1 ORDER BY recorded_at ASC").unwrap();
    let weights = stmt
        .query_map([&id], |r| {
            Ok(json!({"date":r.get::<_,String>(0)?,"weight":r.get::<_,f64>(1)?}))
        })
        .ok()
        .map(|i| i.filter_map(Result::ok).collect::<Vec<_>>())
        .unwrap_or_default();
    let goal=conn.query_row("SELECT target_weight,starting_weight,target_date FROM goals WHERE profile_id=?1 ORDER BY created_at DESC LIMIT 1",[&id],|r|Ok((r.get::<_,Option<f64>>(0)?,r.get::<_,Option<f64>>(1)?,r.get::<_,Option<String>>(2)?))).optional().ok().flatten();
    let unit = conn
        .query_row(
            "SELECT value FROM settings WHERE profile_id=?1 AND key='unit_system'",
            [&id],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or("metric".into());
    let first = weights
        .first()
        .and_then(|v| v.get("weight"))
        .and_then(Value::as_f64)
        .or(goal.as_ref().and_then(|g| g.1));
    let current = weights
        .last()
        .and_then(|v| v.get("weight"))
        .and_then(Value::as_f64);
    let delta = match (first, current) {
        (Some(a), Some(b)) => Some(((b - a) * 100.0).round() / 100.0),
        _ => None,
    };
    let first_date = weights.first().and_then(|v| v.get("date")).cloned();
    let latest_date = weights.last().and_then(|v| v.get("date")).cloned();
    Json(json!({"profile":{"username":username,"display_name":display_name,"avatar_url":avatar_url,"bio":bio,"created_at":created_at},"stats":{"start_weight":first,"current_weight":current,"total_change":delta,"goal_weight":goal.as_ref().and_then(|g|g.0),"goal_target_date":goal.as_ref().and_then(|g|g.2.clone()),"total_entries":weights.len(),"first_date":first_date,"latest_date":latest_date,"unit_system":if unit=="imperial"{"imperial"}else{"metric"}},"history":weights})).into_response()
}
fn admin_profile(app: &App, session: &Option<String>) -> Result<Profile, Response> {
    let p = auth_or_response(app, session)?;
    if p.role != "admin" {
        return Err(error(
            StatusCode::FORBIDDEN,
            "Forbidden: Admin access required",
        ));
    }
    Ok(p)
}
async fn admin_settings_get(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    if let Err(r) = admin_profile(&app, &session) {
        return r;
    }
    let conn = db(&app);
    let row = conn
        .query_row(
            "SELECT value FROM system_settings WHERE key='registration_enabled'",
            [],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten();
    let enabled = row
        .as_ref()
        .map(|v| v == "true" || v == "1")
        .unwrap_or_else(|| {
            env::var("ALLOW_REGISTRATION")
                .map(|v| v != "false" && v != "0")
                .unwrap_or(true)
        });
    Json(json!({"registration_enabled":enabled,"has_override":row.is_some()})).into_response()
}
async fn admin_settings_put(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    if let Err(r) = admin_profile(&app, &session) {
        return r;
    }
    let Some(enabled) = input.get("registration_enabled").and_then(Value::as_bool) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    };
    if db(&app).execute("INSERT INTO system_settings(key,value,updated_at) VALUES('registration_enabled',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",[if enabled{"true"}else{"false"}]).is_err(){return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")}
    Json(json!({"ok":true,"registration_enabled":enabled})).into_response()
}
async fn admin_users(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    if let Err(r) = admin_profile(&app, &session) {
        return r;
    }
    let conn = db(&app);
    let mut stmt=match conn.prepare("SELECT p.id,p.username,p.display_name,p.avatar_url,p.bio,p.role,p.is_public,p.created_at,(SELECT COUNT(*) FROM weight_entries WHERE profile_id=p.id),(SELECT COUNT(*) FROM measurement_entries WHERE profile_id=p.id) FROM profiles p ORDER BY p.created_at ASC"){Ok(s)=>s,Err(_)=>return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")};
    let users=stmt.query_map([],|r|{let id=r.get::<_,String>(0)?;let username=r.get::<_,String>(1)?;let display=r.get::<_,Option<String>>(2)?;let avatar=r.get::<_,Option<String>>(3)?;let bio=r.get::<_,Option<String>>(4)?;let role=r.get::<_,Option<String>>(5)?.unwrap_or("user".into());let public=r.get::<_,i64>(6)?!=0;let created=r.get::<_,String>(7)?;let weights=r.get::<_,i64>(8)?;let measures=r.get::<_,i64>(9)?;Ok(json!({"id":id,"username":username,"displayName":display,"display_name":display,"avatarUrl":avatar,"avatar_url":avatar,"bio":bio,"role":role,"isPublic":public,"is_public":public,"createdAt":created,"created_at":created,"weightCount":weights,"measurementCount":measures}))}).ok().map(|it|it.filter_map(Result::ok).collect::<Vec<_>>()).unwrap_or_default();
    Json(users).into_response()
}
async fn admin_user_role(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    if let Err(r) = admin_profile(&app, &session) {
        return r;
    }
    let Some(role) = input
        .get("role")
        .and_then(Value::as_str)
        .filter(|s| *s == "admin" || *s == "user")
    else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    };
    let conn = db(&app);
    let old = conn
        .query_row("SELECT role FROM profiles WHERE id=?1", [&id], |r| {
            r.get::<_, Option<String>>(0)
        })
        .optional()
        .ok()
        .flatten();
    let Some(old) = old else {
        return error(StatusCode::NOT_FOUND, "User not found");
    };
    if old.as_deref() == Some("admin") && role == "user" {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM profiles WHERE role='admin'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if count <= 1 {
            return error(
                StatusCode::BAD_REQUEST,
                "Cannot demote the only administrator",
            );
        }
    }
    let _ = conn.execute("UPDATE profiles SET role=?1 WHERE id=?2", params![role, id]);
    Json(json!({"ok":true,"role":role})).into_response()
}
async fn admin_user_delete(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let admin = match admin_profile(&app, &session) {
        Ok(v) => v,
        Err(r) => return r,
    };
    if id == admin.id {
        return error(
            StatusCode::BAD_REQUEST,
            "Cannot delete your own administrator account",
        );
    }
    let conn = db(&app);
    let avatar = conn
        .query_row("SELECT avatar_url FROM profiles WHERE id=?1", [&id], |r| {
            r.get::<_, Option<String>>(0)
        })
        .optional()
        .ok()
        .flatten()
        .flatten();
    let mut files = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT filename FROM progress_photos WHERE profile_id=?1") {
        if let Ok(iter) = stmt.query_map([&id], |r| r.get::<_, String>(0)) {
            files.extend(iter.filter_map(Result::ok));
        }
    }
    let changes = conn
        .execute("DELETE FROM profiles WHERE id=?1", [&id])
        .unwrap_or(0);
    if changes == 0 {
        return error(StatusCode::NOT_FOUND, "User not found");
    }
    for file in files {
        let _ = std::fs::remove_file(photos_root().join(file));
    }
    if let Some(url) = avatar {
        if let Some(name) = url.rsplit('/').next() {
            let _ = std::fs::remove_file(photos_root().join("avatars").join(name));
        }
    }
    Json(json!({"ok":true})).into_response()
}
fn json_rows(conn: &Connection, sql: &str, profile_id: &str) -> Value {
    let Ok(mut stmt) = conn.prepare(sql) else {
        return json!([]);
    };
    stmt.query_map([profile_id], |r| r.get::<_, String>(0))
        .ok()
        .map(|iter| {
            Value::Array(
                iter.filter_map(Result::ok)
                    .filter_map(|s| serde_json::from_str(&s).ok())
                    .collect(),
            )
        })
        .unwrap_or(json!([]))
}
fn json_rows_range(conn: &Connection, sql: &str, profile_id: &str, from: &str, to: &str) -> Value {
    let Ok(mut stmt) = conn.prepare(sql) else {
        return json!([]);
    };
    stmt.query_map(params![profile_id, from, to], |r| r.get::<_, String>(0))
        .ok()
        .map(|it| {
            Value::Array(
                it.filter_map(Result::ok)
                    .filter_map(|s| serde_json::from_str(&s).ok())
                    .collect(),
            )
        })
        .unwrap_or(json!([]))
}
async fn export_json(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let body = json!({"exportedAt":Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true),"profileId":p.id,"weight_entries":json_rows(&conn,"SELECT json_object('id',id,'profile_id',profile_id,'value',value,'unit',unit,'recorded_at',recorded_at,'notes',notes,'created_at',created_at,'updated_at',updated_at) FROM weight_entries WHERE profile_id=?1 ORDER BY recorded_at ASC",&p.id),"measurement_definitions":json_rows(&conn,"SELECT json_object('id',id,'profile_id',profile_id,'name',name,'slug',slug,'unit',unit,'is_system',is_system,'display_order',display_order,'created_at',created_at) FROM measurement_definitions WHERE is_system=1 OR profile_id=?1 ORDER BY is_system DESC,display_order ASC",&p.id),"measurement_entries":json_rows(&conn,"SELECT json_object('id',id,'profile_id',profile_id,'definition_id',definition_id,'value',value,'recorded_at',recorded_at,'notes',notes,'created_at',created_at,'updated_at',updated_at) FROM measurement_entries WHERE profile_id=?1 ORDER BY recorded_at ASC",&p.id),"goals":json_rows(&conn,"SELECT json_object('id',id,'profile_id',profile_id,'starting_weight',starting_weight,'starting_weight_unit',starting_weight_unit,'target_weight',target_weight,'target_weight_unit',target_weight_unit,'target_date',target_date,'notes',notes,'created_at',created_at,'updated_at',updated_at) FROM goals WHERE profile_id=?1 ORDER BY created_at ASC",&p.id),"photos":json_rows(&conn,"SELECT json_object('id',id,'profile_id',profile_id,'filename',filename,'original_name',original_name,'view_type',view_type,'recorded_at',recorded_at,'notes',notes,'file_size',file_size,'mime_type',mime_type,'created_at',created_at) FROM progress_photos WHERE profile_id=?1 ORDER BY recorded_at ASC",&p.id)});
    let mut r = Json(body).into_response();
    r.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"body-tracker-export.json\""),
    );
    r
}
fn csv_escape(v: &Value) -> String {
    if v.is_null() {
        return String::new();
    }
    let s = v
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| v.to_string());
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s
    }
}
async fn export_weight_csv(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let vals = json_rows(
        &conn,
        "SELECT json_array(recorded_at,value,unit,notes) FROM weight_entries WHERE profile_id=?1 ORDER BY recorded_at ASC",
        &p.id,
    );
    let mut out = "date,value,unit,notes".to_owned();
    if let Some(rows) = vals.as_array() {
        for row in rows {
            if let Some(cols) = row.as_array() {
                out.push('\n');
                out.push_str(&cols.iter().map(csv_escape).collect::<Vec<_>>().join(","));
            }
        }
    }
    let mut r = out.into_response();
    r.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    r.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"weight-export.csv\""),
    );
    r
}
async fn export_measurement_csv(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let vals = json_rows(
        &conn,
        "SELECT json_array(me.recorded_at,md.name,me.value,md.unit,me.notes) FROM measurement_entries me JOIN measurement_definitions md ON md.id=me.definition_id WHERE me.profile_id=?1 ORDER BY me.recorded_at ASC,md.name ASC",
        &p.id,
    );
    let mut out = "date,measurement_name,value,unit,notes".to_owned();
    if let Some(rows) = vals.as_array() {
        for row in rows {
            if let Some(cols) = row.as_array() {
                out.push('\n');
                out.push_str(&cols.iter().map(csv_escape).collect::<Vec<_>>().join(","));
            }
        }
    }
    let mut r = out.into_response();
    r.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/csv; charset=utf-8"),
    );
    r.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_static("attachment; filename=\"measurements-export.csv\""),
    );
    r
}
async fn import_json(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    Query(q): Query<std::collections::HashMap<String, String>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let preview = q.get("preview").is_some_and(|v| v == "1");
    let weights = input
        .get("weight_entries")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let measures = input
        .get("measurement_entries")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let goals = input
        .get("goals")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if input.as_object().is_none()
        || weights.iter().any(|e| {
            e.get("recorded_at").and_then(Value::as_str).is_none()
                || e.get("value").and_then(Value::as_f64).is_none()
        })
        || measures.iter().any(|e| {
            e.get("definition_id").and_then(Value::as_str).is_none()
                || e.get("recorded_at").and_then(Value::as_str).is_none()
                || e.get("value").and_then(Value::as_f64).is_none()
        })
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let conn = db(&app);
    let mut report = json!({"preview":preview,"weight_entries":{"total":weights.len(),"imported":0,"skipped":0},"measurement_entries":{"total":measures.len(),"imported":0,"skipped":0},"goals":{"total":goals.len(),"imported":0}});
    let mut w_imp = 0;
    let mut w_skip = 0;
    let mut m_imp = 0;
    let mut m_skip = 0;
    for e in &weights {
        let exists:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM weight_entries WHERE profile_id=?1 AND recorded_at=?2)",params![p.id,e["recorded_at"].as_str().unwrap_or("")],|r|r.get(0)).unwrap_or(true);
        if exists { w_skip += 1 } else { w_imp += 1 }
    }
    for e in &measures {
        let exists:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM measurement_definitions WHERE id=?1 AND (is_system=1 OR profile_id=?2))",params![e["definition_id"].as_str().unwrap_or(""),p.id],|r|r.get(0)).unwrap_or(false);
        if exists { m_imp += 1 } else { m_skip += 1 }
    }
    report["weight_entries"]["imported"] = json!(if preview { w_imp } else { 0 });
    report["weight_entries"]["skipped"] = json!(if preview { w_skip } else { 0 });
    report["measurement_entries"]["imported"] = json!(if preview { m_imp } else { 0 });
    report["measurement_entries"]["skipped"] = json!(if preview { m_skip } else { 0 });
    report["goals"]["imported"] = json!(if preview { goals.len() } else { 0 });
    if preview {
        return Json(report).into_response();
    }
    let mut conn = db(&app);
    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"),
    };
    w_imp = 0;
    w_skip = 0;
    m_imp = 0;
    m_skip = 0;
    for e in &weights {
        let changed=tx.execute("INSERT INTO weight_entries(id,profile_id,value,unit,recorded_at,notes) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(profile_id,recorded_at) DO NOTHING",params![new_id(),p.id,e["value"].as_f64(),e["unit"].as_str().unwrap_or("kg"),e["recorded_at"].as_str(),e["notes"].as_str()]).unwrap_or(0);
        if changed > 0 { w_imp += 1 } else { w_skip += 1 }
    }
    for e in &measures {
        let def = e["definition_id"].as_str().unwrap_or("");
        let exists:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM measurement_definitions WHERE id=?1 AND (is_system=1 OR profile_id=?2))",params![def,p.id],|r|r.get(0)).unwrap_or(false);
        if !exists {
            m_skip += 1;
            continue;
        }
        if tx.execute("INSERT INTO measurement_entries(id,profile_id,definition_id,value,recorded_at,notes) VALUES(?1,?2,?3,?4,?5,?6)",params![new_id(),p.id,def,e["value"].as_f64(),e["recorded_at"].as_str(),e["notes"].as_str()]).is_ok(){m_imp+=1}else{m_skip+=1}
    }
    for g in &goals {
        let current = tx
            .query_row("SELECT id FROM goals WHERE profile_id=?1", [&p.id], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .ok()
            .flatten();
        if let Some(id) = current {
            let _=tx.execute("UPDATE goals SET starting_weight=COALESCE(?1,starting_weight),starting_weight_unit=COALESCE(?2,starting_weight_unit),target_weight=COALESCE(?3,target_weight),target_weight_unit=COALESCE(?4,target_weight_unit),target_date=COALESCE(?5,target_date),notes=COALESCE(?6,notes),updated_at=datetime('now') WHERE id=?7",params![g["starting_weight"].as_f64(),g["starting_weight_unit"].as_str(),g["target_weight"].as_f64(),g["target_weight_unit"].as_str(),g["target_date"].as_str(),g["notes"].as_str(),id]);
        } else {
            let _=tx.execute("INSERT INTO goals(id,profile_id,starting_weight,starting_weight_unit,target_weight,target_weight_unit,target_date,notes) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![new_id(),p.id,g["starting_weight"].as_f64(),g["starting_weight_unit"].as_str().unwrap_or("kg"),g["target_weight"].as_f64(),g["target_weight_unit"].as_str().unwrap_or("kg"),g["target_date"].as_str(),g["notes"].as_str()]);
        }
    }
    if tx.commit().is_err() {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
    }
    report["weight_entries"]["imported"] = json!(w_imp);
    report["weight_entries"]["skipped"] = json!(w_skip);
    report["measurement_entries"]["imported"] = json!(m_imp);
    report["measurement_entries"]["skipped"] = json!(m_skip);
    report["goals"]["imported"] = json!(goals.len());
    Json(report).into_response()
}
fn photos_root() -> std::path::PathBuf {
    env::var("PHOTOS_PATH")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from("./data/photos"))
}
fn uploaded_ext(mime: &str) -> Option<&'static str> {
    match mime {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}
fn photo_json(r: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    Ok(
        json!({"id":r.get::<_,String>(0)?,"profile_id":r.get::<_,String>(1)?,"filename":r.get::<_,String>(2)?,"original_name":r.get::<_,String>(3)?,"view_type":r.get::<_,String>(4)?,"recorded_at":r.get::<_,String>(5)?,"notes":r.get::<_,Option<String>>(6)?,"file_size":r.get::<_,Option<i64>>(7)?,"mime_type":r.get::<_,Option<String>>(8)?,"created_at":r.get::<_,String>(9)?}),
    )
}
fn photo_with_aliases(mut photo: Value) -> Value {
    if let Some(m) = photo.as_object_mut() {
        let id = m.get("id").cloned().unwrap_or(Value::Null);
        let rec = m
            .get("recorded_at")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();
        let vt = m.get("view_type").cloned().unwrap_or(Value::Null);
        m.insert(
            "url".into(),
            json!(format!("/api/photos/{}/file", id.as_str().unwrap_or(""))),
        );
        m.insert("date".into(), json!(rec.split('T').next().unwrap_or("")));
        m.insert("viewType".into(), vt);
    }
    photo
}
async fn photos_list(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    if q.get("view_type")
        .is_some_and(|v| !["front", "side", "back", "other"].contains(&v.as_str()))
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let conn = db(&app);
    let mut stmt=match conn.prepare("SELECT id,profile_id,filename,original_name,view_type,recorded_at,notes,file_size,mime_type,created_at FROM progress_photos WHERE profile_id=?1 AND (?2 IS NULL OR view_type=?2) AND (?3 IS NULL OR recorded_at>=?3) AND (?4 IS NULL OR recorded_at<=?4) ORDER BY recorded_at DESC"){Ok(s)=>s,Err(_)=>return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")};
    let rows = stmt
        .query_map(
            params![p.id, q.get("view_type"), q.get("from"), q.get("to")],
            photo_json,
        )
        .ok()
        .map(|it| {
            it.filter_map(Result::ok)
                .map(photo_with_aliases)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Json(rows).into_response()
}
async fn photos_upload(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    mut multipart: Multipart,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let mut view = None;
    let mut recorded = None;
    let mut notes = None;
    let mut original = None;
    let mut mime = None;
    let mut bytes: Option<Vec<u8>> = None;
    loop {
        let next = match multipart.next_field().await {
            Ok(v) => v,
            Err(_) => return error(StatusCode::BAD_REQUEST, "Invalid multipart upload"),
        };
        let Some(mut field) = next else { break };
        let name = field.name().unwrap_or("").to_owned();
        if name == "view_type" || name == "viewType" {
            view = field.text().await.ok()
        } else if name == "recorded_at" || name == "date" {
            recorded = field.text().await.ok()
        } else if name == "notes" {
            notes = field.text().await.ok()
        } else if ["file", "photo", "image"].contains(&name.as_str()) {
            let typ = field.content_type().unwrap_or("").to_owned();
            if uploaded_ext(&typ).is_none() {
                return (StatusCode::UNSUPPORTED_MEDIA_TYPE,Json(json!({"error":"Unsupported media type. Only JPEG, PNG, and WebP are allowed."}))).into_response();
            }
            original = field.file_name().map(str::to_owned);
            mime = Some(typ);
            let mut data = Vec::new();
            while let Ok(Some(chunk)) = field.chunk().await {
                if data.len() + chunk.len() > 10 * 1024 * 1024 {
                    return error(StatusCode::PAYLOAD_TOO_LARGE, "File too large");
                }
                data.extend_from_slice(&chunk)
            }
            bytes = Some(data);
        }
    }
    let Some(view) = view.filter(|v| ["front", "side", "back", "other"].contains(&v.as_str()))
    else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    };
    let Some(recorded) = recorded.filter(|v| !v.is_empty()) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    };
    let (Some(data), Some(mime)) = (bytes, mime) else {
        return error(StatusCode::BAD_REQUEST, "No file was uploaded");
    };
    let ext = uploaded_ext(&mime).unwrap();
    let filename = format!("{}.{}", new_id(), ext);
    let root = photos_root();
    if std::fs::create_dir_all(&root).is_err()
        || std::fs::write(root.join(&filename), &data).is_err()
    {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Upload failed");
    };
    let id = new_id();
    let orig = original.unwrap_or_else(|| filename.clone());
    let conn = db(&app);
    if conn.execute("INSERT INTO progress_photos(id,profile_id,filename,original_name,view_type,recorded_at,notes,file_size,mime_type) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",params![id,p.id,filename,orig,view,recorded,notes,data.len() as i64,mime]).is_err(){let _=std::fs::remove_file(root.join(filename));return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")}
    let row=conn.query_row("SELECT id,profile_id,filename,original_name,view_type,recorded_at,notes,file_size,mime_type,created_at FROM progress_photos WHERE id=?1",[id],photo_json).unwrap_or(Value::Null);
    (StatusCode::CREATED, Json(photo_with_aliases(row))).into_response()
}
async fn photos_delete(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let file = conn
        .query_row(
            "SELECT filename FROM progress_photos WHERE id=?1 AND profile_id=?2",
            params![id, p.id],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten();
    let Some(file) = file else {
        return error(StatusCode::NOT_FOUND, "Photo not found");
    };
    let _ = conn.execute("DELETE FROM progress_photos WHERE id=?1", [id]);
    let _ = std::fs::remove_file(photos_root().join(file));
    Json(json!({"ok":true})).into_response()
}
async fn photos_file(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let row = db(&app)
        .query_row(
            "SELECT filename,mime_type FROM progress_photos WHERE id=?1 AND profile_id=?2",
            params![id, p.id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?)),
        )
        .optional()
        .ok()
        .flatten();
    let Some((file, mime)) = row else {
        return error(StatusCode::NOT_FOUND, "Photo not found");
    };
    let bytes = match std::fs::read(photos_root().join(file)) {
        Ok(b) => b,
        Err(_) => return error(StatusCode::NOT_FOUND, "File not found on disk"),
    };
    let mut resp = Response::new(Body::from(bytes));
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&mime.unwrap_or("application/octet-stream".into()))
            .unwrap_or(HeaderValue::from_static("application/octet-stream")),
    );
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=3600"),
    );
    resp
}
async fn avatar_upload(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    mut multipart: Multipart,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let mut data = None;
    let mut mime = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name().unwrap_or("") != "file"
            && field.name().unwrap_or("") != "avatar"
            && field.name().unwrap_or("") != "image"
        {
            continue;
        }
        let t = field.content_type().unwrap_or("").to_owned();
        if uploaded_ext(&t).is_none() {
            return error(
                StatusCode::BAD_REQUEST,
                "Unsupported file type. Allowed types: JPEG, PNG, WebP.",
            );
        }
        let b = field.bytes().await.unwrap_or_default();
        if b.len() > 5 * 1024 * 1024 {
            return error(StatusCode::PAYLOAD_TOO_LARGE, "File exceeds 5MB size limit");
        }
        data = Some(b);
        mime = Some(t);
        break;
    }
    let (Some(bytes), Some(mime)) = (data, mime) else {
        return error(StatusCode::BAD_REQUEST, "No image file uploaded");
    };
    let root = photos_root().join("avatars");
    if std::fs::create_dir_all(&root).is_err() {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
    }
    let filename = format!("avatar_{}.{}", new_id(), uploaded_ext(&mime).unwrap());
    if std::fs::write(root.join(&filename), bytes).is_err() {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
    }
    let url = format!("/api/profile/avatar/{filename}");
    let _ = db(&app).execute(
        "UPDATE profiles SET avatar_url=?1 WHERE id=?2",
        params![url, p.id],
    );
    Json(json!({"ok":true,"avatar_url":url,"avatarUrl":url})).into_response()
}
async fn avatar_delete(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    if let Some(url) = p.avatar_url {
        if let Some(filename) = url.rsplit('/').next() {
            let _ = std::fs::remove_file(photos_root().join("avatars").join(filename));
        }
    }
    let _ = db(&app).execute("UPDATE profiles SET avatar_url=NULL WHERE id=?1", [p.id]);
    Json(json!({"ok":true})).into_response()
}
async fn avatar_file(RoutePath(filename): RoutePath<String>) -> Response {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return error(StatusCode::BAD_REQUEST, "Invalid filename");
    }
    let path = photos_root().join("avatars").join(&filename);
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(_) => return error(StatusCode::NOT_FOUND, "Avatar not found"),
    };
    let mime = match filename.rsplit('.').next().unwrap_or("") {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    };
    let mut resp = Response::new(Body::from(bytes));
    resp.headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
    resp.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=86400, stale-while-revalidate=604800"),
    );
    resp
}
fn fast_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    Ok(
        json!({"id":r.get::<_,String>(0)?,"profile_id":r.get::<_,String>(1)?,"fast_type":r.get::<_,String>(2)?,"target_duration_hours":r.get::<_,f64>(3)?,"started_at":r.get::<_,String>(4)?,"ended_at":r.get::<_,Option<String>>(5)?,"status":r.get::<_,String>(6)?,"notes":r.get::<_,Option<String>>(7)?,"mood":r.get::<_,Option<String>>(8)?,"created_at":r.get::<_,String>(9)?,"updated_at":r.get::<_,String>(10)?}),
    )
}
fn active_fast(conn: &Connection, id: &str) -> Option<Value> {
    conn.query_row("SELECT id,profile_id,fast_type,target_duration_hours,started_at,ended_at,status,notes,mood,created_at,updated_at FROM fasting_sessions WHERE profile_id=?1 AND status='active' ORDER BY started_at DESC LIMIT 1",[id],fast_row).optional().ok().flatten()
}
fn datetime_ms(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|d| d.timestamp_millis())
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S")
                .ok()
                .map(|d| d.and_utc().timestamp_millis())
        })
}
async fn fasting_active(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    Json(json!({"activeFast":active_fast(&db(&app),&p.id)})).into_response()
}
async fn fasting_start(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    if active_fast(&conn, &p.id).is_some() {
        return error(
            StatusCode::CONFLICT,
            "An active fast is already running. End or cancel it first.",
        );
    }
    let ty = input
        .get("fast_type")
        .and_then(Value::as_str)
        .unwrap_or("16:8");
    let target = input
        .get("target_duration_hours")
        .and_then(Value::as_f64)
        .unwrap_or(16.0);
    let notes = input.get("notes").and_then(Value::as_str);
    if !target.is_finite() || target <= 0.0 || notes.is_some_and(|s| s.len() > 500) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let start = input
        .get("started_at")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    let id = new_id();
    if conn.execute("INSERT INTO fasting_sessions(id,profile_id,fast_type,target_duration_hours,started_at,status,notes) VALUES(?1,?2,?3,?4,?5,'active',?6)",params![id,p.id,ty,target,start,notes]).is_err(){return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")}
    let row=conn.query_row("SELECT id,profile_id,fast_type,target_duration_hours,started_at,ended_at,status,notes,mood,created_at,updated_at FROM fasting_sessions WHERE id=?1",[id],fast_row).unwrap_or(Value::Null);
    (StatusCode::CREATED, Json(row)).into_response()
}
async fn fasting_end(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let Some(active) = active_fast(&conn, &p.id) else {
        return error(StatusCode::NOT_FOUND, "No active fast found to complete.");
    };
    let status = input
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("completed");
    let mood = input.get("mood").and_then(Value::as_str);
    let notes = input
        .get("notes")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| active["notes"].as_str().map(str::to_owned));
    if !["completed", "cancelled"].contains(&status)
        || mood.is_some_and(|m| !["great", "good", "neutral", "struggling"].contains(&m))
        || notes.as_ref().is_some_and(|s| s.len() > 500)
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let finish = input
        .get("ended_at")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .unwrap_or_else(|| Utc::now().to_rfc3339());
    let duration = datetime_ms(&finish)
        .zip(active["started_at"].as_str().and_then(datetime_ms))
        .map(|(a, b)| (a - b) as f64 / 3600000.0)
        .unwrap_or(0.0);
    if status == "completed" && duration < 8.0 {
        let _ = conn.execute(
            "DELETE FROM fasting_sessions WHERE id=?1 AND profile_id=?2",
            params![active["id"].as_str().unwrap_or(""), p.id],
        );
        return Json(json!({"recorded":false,"reason":"minimum_duration","minimumHours":8,"durationHours":duration.max(0.0)})).into_response();
    }
    let _=conn.execute("UPDATE fasting_sessions SET ended_at=?1,status=?2,notes=?3,mood=?4,updated_at=datetime('now') WHERE id=?5",params![finish,status,notes,mood,active["id"].as_str().unwrap_or("")]);
    Json(conn.query_row("SELECT id,profile_id,fast_type,target_duration_hours,started_at,ended_at,status,notes,mood,created_at,updated_at FROM fasting_sessions WHERE id=?1",[active["id"].as_str().unwrap_or("")],fast_row).unwrap_or(Value::Null)).into_response()
}
async fn fasting_patch(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let Some(active) = active_fast(&conn, &p.id) else {
        return error(StatusCode::NOT_FOUND, "No active fast found.");
    };
    let target = input.get("target_duration_hours").and_then(Value::as_f64);
    let ty = input
        .get("fast_type")
        .and_then(Value::as_str)
        .unwrap_or(active["fast_type"].as_str().unwrap_or("16:8"));
    let started = input
        .get("started_at")
        .and_then(Value::as_str)
        .unwrap_or(active["started_at"].as_str().unwrap_or(""));
    let notes = input
        .get("notes")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .or_else(|| active["notes"].as_str().map(str::to_owned));
    if target.is_some_and(|n| !n.is_finite() || n <= 0.0)
        || notes.as_ref().is_some_and(|n| n.len() > 500)
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let _=conn.execute("UPDATE fasting_sessions SET started_at=?1,target_duration_hours=?2,fast_type=?3,notes=?4,updated_at=datetime('now') WHERE id=?5",params![started,target.unwrap_or(active["target_duration_hours"].as_f64().unwrap_or(16.0)),ty,notes,active["id"].as_str().unwrap_or("")]);
    Json(active_fast(&conn, &p.id).unwrap_or(Value::Null)).into_response()
}
async fn fasting_discard_active(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let _ = db(&app).execute(
        "DELETE FROM fasting_sessions WHERE profile_id=?1 AND status='active'",
        [p.id],
    );
    Json(json!({"success":true})).into_response()
}
async fn fasting_history(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let mut stmt=match conn.prepare("SELECT id,profile_id,fast_type,target_duration_hours,started_at,ended_at,status,notes,mood,created_at,updated_at FROM fasting_sessions WHERE profile_id=?1 AND status!='active' AND (status!='completed' OR (ended_at IS NOT NULL AND (julianday(ended_at)-julianday(started_at))*24>=8)) ORDER BY started_at DESC LIMIT 100"){Ok(s)=>s,Err(_)=>return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")};
    let sessions = stmt
        .query_map([&p.id], fast_row)
        .ok()
        .map(|i| i.filter_map(Result::ok).collect::<Vec<_>>())
        .unwrap_or_default();
    let mut total = 0.0f64;
    let mut longest = 0.0f64;
    let mut count = 0;
    for s in &sessions {
        if s["status"] == "completed" {
            if let Some(d) = s["ended_at"]
                .as_str()
                .and_then(datetime_ms)
                .zip(s["started_at"].as_str().and_then(datetime_ms))
                .map(|(a, b)| (a - b) as f64 / 3600000.0)
            {
                if d > 0.0 {
                    total += d;
                    longest = longest.max(d);
                    count += 1
                }
            }
        }
    }
    let round = |v: f64| (v * 10.0).round() / 10.0;
    Json(json!({"sessions":sessions,"stats":{"totalFasts":sessions.len(),"completedFasts":count,"totalHoursFasted":round(total),"longestFastHours":round(longest),"averageDurationHours":if count>0{round(total/count as f64)}else{0.0}}})).into_response()
}
async fn public_fasting_widget(
    State(app): State<App>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let token = q.get("token");
    let username = q.get("username");
    let conn = db(&app);
    let profile = if let Some(token) = token {
        conn.query_row("SELECT p.id,p.username,p.display_name FROM settings s JOIN profiles p ON p.id=s.profile_id WHERE s.key='fasting_widget_token' AND s.value=?1",[token],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,Option<String>>(2)?))).optional().ok().flatten()
    } else if let Some(username) = username {
        conn.query_row("SELECT id,username,display_name FROM profiles WHERE LOWER(username)=LOWER(?1) AND is_public=1",[username.trim_start_matches('@').trim()],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,Option<String>>(2)?))).optional().ok().flatten()
    } else {
        None
    };
    let Some((id, username, display)) = profile else {
        return error(StatusCode::NOT_FOUND, "Widget not found or invalid token");
    };
    let active = active_fast(&conn, &id);
    let profile_json = json!({"username":username,"display_name":display});
    let Some(fast) = active else {
        return Json(json!({"active":false,"profile":profile_json,"fast":null})).into_response();
    };
    let start = fast["started_at"]
        .as_str()
        .and_then(datetime_ms)
        .unwrap_or_else(|| Utc::now().timestamp_millis());
    let elapsed = ((Utc::now().timestamp_millis() - start).max(0)) as f64 / 1000.0;
    let hours = elapsed / 3600.0;
    let target = fast["target_duration_hours"].as_f64().unwrap_or(16.0);
    let remaining = (target - hours).max(0.0);
    let (sid, stage, tag, color) = if hours < 4.0 {
        (
            1,
            "Fed & Anabolic State",
            "Digestion & Nutrient Absorption",
            "#3b82f6",
        )
    } else if hours < 8.0 {
        (
            2,
            "Post-Absorptive State",
            "Blood Sugar Normalization",
            "#06b6d4",
        )
    } else if hours < 12.0 {
        (
            3,
            "Early Fat Burning",
            "Glycogen Depletion Commences",
            "#10b981",
        )
    } else if hours < 16.0 {
        (
            4,
            "The Metabolic Switch",
            "Fat Oxidation & Early Ketones",
            "#eab308",
        )
    } else if hours < 24.0 {
        (
            5,
            "Deep Ketosis & Autophagy",
            "Cellular Cleansing & Recycling",
            "#f97316",
        )
    } else if hours < 48.0 {
        (
            6,
            "Peak Autophagy & HGH Surge",
            "Deep Repair & Renewal",
            "#a855f7",
        )
    } else {
        (
            7,
            "Stem Cell & Immune Reset",
            "Immune System Regeneration",
            "#ec4899",
        )
    };
    Json(json!({"active":true,"profile":profile_json,"fast":{"id":fast["id"],"fast_type":fast["fast_type"],"target_duration_hours":target,"started_at":fast["started_at"],"elapsed_seconds":elapsed.floor(),"elapsed_hours":rounded(hours,2),"remaining_seconds":(remaining*3600.0).floor(),"remaining_hours":rounded(remaining,2),"progress_percent":((hours/target*100.0).round()).min(100.0),"is_goal_reached":hours>=target,"stage":{"id":sid,"minHours":match sid{1=>0,2=>4,3=>8,4=>12,5=>16,6=>24,_=>48},"maxHours":match sid{1=>4,2=>8,3=>12,4=>16,5=>24,6=>48,_=>999999},"name":stage,"tagline":tag,"color":color}}})).into_response()
}
async fn fasting_delete(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let _ = db(&app).execute(
        "DELETE FROM fasting_sessions WHERE id=?1 AND profile_id=?2",
        params![id, p.id],
    );
    Json(json!({"success":true})).into_response()
}
async fn fasting_token(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    regenerate: bool,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let old = conn
        .query_row(
            "SELECT id,value FROM settings WHERE profile_id=?1 AND key='fasting_widget_token'",
            [&p.id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .optional()
        .ok()
        .flatten();
    if let Some((id, value)) = old {
        if !regenerate {
            return Json(json!({"token":value})).into_response();
        }
        let token = format!("fwt_{}", new_id());
        let _ = conn.execute(
            "UPDATE settings SET value=?1 WHERE id=?2",
            params![token, id],
        );
        Json(json!({"token":token})).into_response()
    } else {
        let token = format!("fwt_{}", new_id());
        let _ = conn.execute(
            "INSERT INTO settings(id,profile_id,key,value) VALUES(?1,?2,'fasting_widget_token',?3)",
            params![new_id(), p.id, token],
        );
        Json(json!({"token":token})).into_response()
    }
}
async fn fasting_token_get(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    fasting_token(State(app), session, false).await
}
async fn fasting_token_regenerate(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    fasting_token(State(app), session, true).await
}
fn nutrition_calculation(
    weight: f64,
    height: f64,
    sex: &str,
    age: i64,
    activity: &str,
    goal: &str,
    diet: &str,
) -> Value {
    let multip = match activity {
        "sedentary" => 1.2,
        "light" => 1.375,
        "moderate" => 1.55,
        "very_active" => 1.725,
        "extra_active" => 1.9,
        _ => 1.55,
    };
    let base = 10.0 * weight + 6.25 * height - 5.0 * age as f64;
    let bmr = (base
        + match sex {
            "male" => 5.0,
            "female" => -161.0,
            _ => -78.0,
        })
    .round();
    let tdee = (bmr * multip).round();
    let target = match goal {
        "lose" => (tdee - 500.0).round().max(1200.0),
        "gain" => (tdee + 300.0).round(),
        _ => tdee,
    };
    let ideal = (24.9 * (height / 100.0).powi(2) * 10.0).round() / 10.0;
    let use_ideal = weight > 80.0 && ideal < weight;
    let basis = if use_ideal { ideal } else { weight };
    let per = match diet {
        "keto" => 1.8,
        "carnivore" => 2.4,
        "balanced" | "mediterranean" => 1.8,
        _ => 2.2,
    };
    let protein = (basis * per).round();
    let (carbs, fat) = if diet == "carnivore" {
        (0.0, ((target - protein * 4.0).max(0.0) / 9.0).round())
    } else if diet == "keto" {
        (
            25.0,
            ((target - protein * 4.0 - 100.0).max(0.0) / 9.0).round(),
        )
    } else {
        let (cp, fp) = match diet {
            "balanced" => (40.0, 30.0),
            "mediterranean" => (45.0, 30.0),
            "custom" => (40.0, 30.0),
            _ => (25.0, 40.0),
        };
        let rem = (target - protein * 4.0).max(0.0);
        let share = cp / (cp + fp);
        (
            (rem * share / 4.0).round().max(20.0),
            (rem * (1.0 - share) / 9.0).round().max(30.0),
        )
    };
    let calculated = protein * 4.0 + carbs * 4.0 + fat * 9.0;
    let calories = target.max(calculated);
    let pp = (protein * 4.0 / calories * 100.0).round();
    let cp = (carbs * 4.0 / calories * 100.0).round();
    let fp = (100.0 - pp - cp).max(0.0);
    json!({"bmr":bmr,"tdee":tdee,"dailyCalories":calories,"proteinGrams":protein,"carbsGrams":carbs,"fatGrams":fat,"proteinPct":pp,"carbsPct":cp,"fatPct":fp,"dietType":diet,"activityLevel":activity,"basisWeightKg":basis,"isIdealWeightUsed":use_ideal,"maxIdealWeightKg":ideal})
}
fn diet_configs() -> Value {
    json!({"high_protein_low_carb":{"name":"High-Protein / Low-Carb","description":"Sparing lean mass, high satiety, accelerated fat loss.","proteinPct":35,"carbsPct":25,"fatPct":40},"keto":{"name":"Ketogenic (Keto)","description":"Very low carb to stimulate deep nutritional ketosis.","proteinPct":25,"carbsPct":5,"fatPct":70},"balanced":{"name":"Balanced","description":"Even distribution for steady energy and balanced nutrition.","proteinPct":30,"carbsPct":40,"fatPct":30},"mediterranean":{"name":"Mediterranean","description":"Nutrient-rich complex carbs with heart-healthy fats.","proteinPct":25,"carbsPct":45,"fatPct":30},"carnivore":{"name":"Carnivore / Zero Carb","description":"Animal-based nutrition, zero carbohydrate intake.","proteinPct":45,"carbsPct":0,"fatPct":55},"custom":{"name":"Custom","description":"Custom macronutrient distribution.","proteinPct":30,"carbsPct":40,"fatPct":30}})
}
async fn nutrition_plan_get(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let diets = [
        "high_protein_low_carb",
        "keto",
        "balanced",
        "mediterranean",
        "carnivore",
        "custom",
    ];
    let activities = [
        "sedentary",
        "light",
        "moderate",
        "very_active",
        "extra_active",
    ];
    if q.get("diet_type")
        .is_some_and(|s| !diets.contains(&s.as_str()))
        || q.get("activity_level")
            .is_some_and(|s| !activities.contains(&s.as_str()))
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let conn = db(&app);
    let mut stmt = conn
        .prepare("SELECT key,value FROM settings WHERE profile_id=?1")
        .unwrap();
    let settings = stmt
        .query_map([&p.id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .ok()
        .map(|i| {
            i.filter_map(Result::ok)
                .collect::<std::collections::HashMap<_, _>>()
        })
        .unwrap_or_default();
    let height = settings
        .get("height_cm")
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(175.0);
    let sex = settings.get("sex").map(String::as_str).unwrap_or("male");
    let age = settings
        .get("date_of_birth")
        .and_then(|s| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").ok())
        .map(|d| (Utc::now().date_naive().year() - d.year()).max(16) as i64)
        .unwrap_or(30);
    let latest=conn.query_row("SELECT value,unit FROM weight_entries WHERE profile_id=?1 ORDER BY recorded_at DESC LIMIT 1",[&p.id],|r|Ok((r.get::<_,f64>(0)?,r.get::<_,String>(1)?))).optional().ok().flatten();
    let weight = latest
        .as_ref()
        .map(|(v, u)| {
            if u == "lbs" {
                (v / 2.20462 * 10.0).round() / 10.0
            } else {
                *v
            }
        })
        .unwrap_or(75.0);
    let goal_weight = conn
        .query_row(
            "SELECT target_weight FROM goals WHERE profile_id=?1 ORDER BY created_at DESC LIMIT 1",
            [&p.id],
            |r| r.get::<_, Option<f64>>(0),
        )
        .optional()
        .ok()
        .flatten()
        .flatten();
    let goal = goal_weight
        .zip(latest.as_ref())
        .map(|(g, (v, _))| {
            if g < *v - 0.5 {
                "lose"
            } else if g > *v + 0.5 {
                "gain"
            } else {
                "maintain"
            }
        })
        .unwrap_or("maintain");
    let saved=conn.query_row("SELECT json_object('id',id,'profile_id',profile_id,'diet_type',diet_type,'activity_level',activity_level,'daily_calories',daily_calories,'protein_grams',protein_grams,'carbs_grams',carbs_grams,'fat_grams',fat_grams,'protein_pct',protein_pct,'carbs_pct',carbs_pct,'fat_pct',fat_pct,'created_at',created_at,'updated_at',updated_at) FROM nutrition_plans WHERE profile_id=?1",[&p.id],|r|r.get::<_,String>(0)).optional().ok().flatten().and_then(|s|serde_json::from_str::<Value>(&s).ok());
    let activity = q
        .get("activity_level")
        .map(String::as_str)
        .or_else(|| saved.as_ref().and_then(|v| v["activity_level"].as_str()))
        .unwrap_or("moderate");
    let diet = q
        .get("diet_type")
        .map(String::as_str)
        .or_else(|| saved.as_ref().and_then(|v| v["diet_type"].as_str()))
        .unwrap_or("high_protein_low_carb");
    let calculated = nutrition_calculation(weight, height, sex, age, activity, goal, diet);
    Json(json!({"plan":saved,"calculated":calculated,"userDetails":{"heightCm":height,"sex":sex,"ageYears":age,"weightKg":weight,"goal":goal},"dietConfigs":diet_configs()})).into_response()
}
async fn nutrition_plan_put(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let diets = [
        "high_protein_low_carb",
        "keto",
        "balanced",
        "mediterranean",
        "carnivore",
        "custom",
    ];
    let activities = [
        "sedentary",
        "light",
        "moderate",
        "very_active",
        "extra_active",
    ];
    let diet = input
        .get("diet_type")
        .and_then(Value::as_str)
        .unwrap_or("high_protein_low_carb");
    let activity = input
        .get("activity_level")
        .and_then(Value::as_str)
        .unwrap_or("moderate");
    let vals = [
        "daily_calories",
        "protein_grams",
        "carbs_grams",
        "fat_grams",
        "protein_pct",
        "carbs_pct",
        "fat_pct",
    ]
    .map(|k| input.get(k).and_then(Value::as_f64));
    if !diets.contains(&diet)
        || !activities.contains(&activity)
        || vals.iter().any(Option::is_none)
        || vals[0].unwrap() <= 0.0
        || vals[1..4].iter().any(|v| v.unwrap() < 0.0)
        || vals[4..]
            .iter()
            .any(|v| v.unwrap() < 0.0 || v.unwrap() > 100.0)
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let conn = db(&app);
    let id = new_id();
    let _=conn.execute("INSERT INTO nutrition_plans(id,profile_id,diet_type,activity_level,daily_calories,protein_grams,carbs_grams,fat_grams,protein_pct,carbs_pct,fat_pct,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,datetime('now')) ON CONFLICT(profile_id) DO UPDATE SET diet_type=excluded.diet_type,activity_level=excluded.activity_level,daily_calories=excluded.daily_calories,protein_grams=excluded.protein_grams,carbs_grams=excluded.carbs_grams,fat_grams=excluded.fat_grams,protein_pct=excluded.protein_pct,carbs_pct=excluded.carbs_pct,fat_pct=excluded.fat_pct,updated_at=datetime('now')",params![id,p.id,diet,activity,vals[0],vals[1],vals[2],vals[3],vals[4],vals[5],vals[6]]);
    let saved=conn.query_row("SELECT json_object('id',id,'profile_id',profile_id,'diet_type',diet_type,'activity_level',activity_level,'daily_calories',daily_calories,'protein_grams',protein_grams,'carbs_grams',carbs_grams,'fat_grams',fat_grams,'protein_pct',protein_pct,'carbs_pct',carbs_pct,'fat_pct',fat_pct,'created_at',created_at,'updated_at',updated_at) FROM nutrition_plans WHERE profile_id=?1",[p.id],|r|r.get::<_,String>(0)).ok().and_then(|s|serde_json::from_str::<Value>(&s).ok()).unwrap_or(Value::Null);
    Json(saved).into_response()
}
async fn nutrition_logs_get(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    Query(q): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let obj = "json_object('id',id,'profile_id',profile_id,'date',date,'calories',calories,'protein_grams',protein_grams,'carbs_grams',carbs_grams,'fat_grams',fat_grams,'notes',notes,'created_at',created_at,'updated_at',updated_at)";
    if let Some(date) = q.get("date") {
        let row = conn
            .query_row(
                &format!("SELECT {obj} FROM daily_nutrition_logs WHERE profile_id=?1 AND date=?2"),
                params![p.id, date],
                |r| r.get::<_, String>(0),
            )
            .optional()
            .ok()
            .flatten()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok());
        return Json(json!({"log":row})).into_response();
    }
    let sql = format!(
        "SELECT {obj} FROM daily_nutrition_logs WHERE profile_id=?1 AND (?2 IS NULL OR date>=?2) AND (?3 IS NULL OR date<=?3) ORDER BY date DESC LIMIT 60"
    );
    let mut stmt = conn.prepare(&sql).unwrap();
    let logs = stmt
        .query_map(params![p.id, q.get("from"), q.get("to")], |r| {
            r.get::<_, String>(0)
        })
        .ok()
        .map(|it| {
            it.filter_map(Result::ok)
                .filter_map(|s| serde_json::from_str(&s).ok())
                .collect::<Vec<Value>>()
        })
        .unwrap_or_default();
    Json(json!({"logs":logs})).into_response()
}
async fn nutrition_logs_post(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let Some(date) = input
        .get("date")
        .and_then(Value::as_str)
        .filter(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").is_ok())
    else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    };
    for k in ["calories", "protein_grams", "carbs_grams", "fat_grams"] {
        if input
            .get(k)
            .is_some_and(|v| !v.is_null() && v.as_f64().is_none_or(|n| n < 0.0))
        {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error":"Validation failed","issues":[]})),
            )
                .into_response();
        }
    }
    let notes = input.get("notes");
    if notes.and_then(Value::as_str).is_some_and(|s| s.len() > 500) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    let conn = db(&app);
    let _=conn.execute("INSERT INTO daily_nutrition_logs(id,profile_id,date,calories,protein_grams,carbs_grams,fat_grams,notes,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,datetime('now')) ON CONFLICT(profile_id,date) DO UPDATE SET calories=excluded.calories,protein_grams=excluded.protein_grams,carbs_grams=excluded.carbs_grams,fat_grams=excluded.fat_grams,notes=excluded.notes,updated_at=datetime('now')",params![new_id(),p.id,date,input["calories"].as_f64(),input["protein_grams"].as_f64(),input["carbs_grams"].as_f64(),input["fat_grams"].as_f64(),notes.and_then(Value::as_str)]);
    let row=conn.query_row("SELECT json_object('id',id,'profile_id',profile_id,'date',date,'calories',calories,'protein_grams',protein_grams,'carbs_grams',carbs_grams,'fat_grams',fat_grams,'notes',notes,'created_at',created_at,'updated_at',updated_at) FROM daily_nutrition_logs WHERE profile_id=?1 AND date=?2",params![p.id,date],|r|r.get::<_,String>(0)).ok().and_then(|s|serde_json::from_str::<Value>(&s).ok()).unwrap_or(Value::Null);
    Json(row).into_response()
}
fn rounded(v: f64, d: u32) -> f64 {
    let m = 10f64.powi(d as i32);
    (v * m).round() / m
}
fn bmi_category(v: f64) -> &'static str {
    if v < 18.5 {
        "Underweight"
    } else if v < 25.0 {
        "Normal weight"
    } else if v < 30.0 {
        "Overweight"
    } else {
        "Obese"
    }
}
fn bodyfat_male(waist: f64, neck: f64, height: f64) -> f64 {
    if waist <= neck || height <= 0.0 {
        return 0.0;
    }
    rounded(
        (495.0 / (1.0324 - 0.19077 * (waist - neck).log10() + 0.15456 * height.log10()) - 450.0)
            .clamp(0.0, 100.0),
        1,
    )
}
fn bodyfat_female(waist: f64, hips: f64, neck: f64, height: f64) -> f64 {
    if waist + hips <= neck || height <= 0.0 {
        return 0.0;
    }
    rounded(
        (495.0 / (1.29579 - 0.35004 * (waist + hips - neck).log10() + 0.221 * height.log10())
            - 450.0)
            .clamp(0.0, 100.0),
        1,
    )
}
fn deurenberg(bmi: f64, age: i64, sex: &str) -> f64 {
    if bmi <= 0.0 {
        return 0.0;
    }
    rounded(
        (1.2 * bmi + 0.23 * (age as f64).clamp(10.0, 100.0)
            - if sex == "female" { 0.0 } else { 10.8 }
            - 5.4)
            .clamp(3.0, 65.0),
        1,
    )
}
async fn body_composition(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let conn = db(&app);
    let mut stmt = conn
        .prepare("SELECT key,value FROM settings WHERE profile_id=?1")
        .unwrap();
    let settings = stmt
        .query_map([&p.id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .ok()
        .map(|it| {
            it.filter_map(Result::ok)
                .collect::<std::collections::HashMap<_, _>>()
        })
        .unwrap_or_default();
    let sex = settings.get("sex").map(String::as_str).unwrap_or("");
    let unit = settings
        .get("unit_system")
        .map(String::as_str)
        .unwrap_or("metric");
    let setting_height = settings
        .get("height_cm")
        .and_then(|v| v.parse::<f64>().ok());
    let age = settings
        .get("date_of_birth")
        .and_then(|d| chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok())
        .map(|d| {
            let today = Utc::now().date_naive();
            let mut n = today.year() - d.year();
            if (today.month(), today.day()) < (d.month(), d.day()) {
                n -= 1
            }
            if (10..=120).contains(&n) { n } else { 30 }
        })
        .unwrap_or(30) as i64;
    let slugs = [
        "waist",
        "neck",
        "hips",
        "chest",
        "height",
        "left_upper_arm",
        "right_upper_arm",
        "left_forearm",
        "right_forearm",
        "left_thigh",
        "right_thigh",
        "left_calf",
        "right_calf",
    ];
    let mut latest = BTreeMap::<String, f64>::new();
    for slug in slugs {
        if let Some(v)=conn.query_row("SELECT me.value FROM measurement_entries me JOIN measurement_definitions md ON md.id=me.definition_id WHERE me.profile_id=?1 AND md.slug=?2 ORDER BY me.recorded_at DESC LIMIT 1",params![p.id,slug],|r|r.get::<_,f64>(0)).optional().ok().flatten(){latest.insert(slug.to_owned(),v);}
    }
    let h = latest.get("height").copied().or(setting_height);
    let weight_json = json_rows(
        &conn,
        "SELECT json_array(value,unit,recorded_at) FROM weight_entries WHERE profile_id=?1 ORDER BY recorded_at ASC",
        &p.id,
    );
    let weights = weight_json.as_array().cloned().unwrap_or_default();
    let kg = |row: &Value| {
        let v = row[0].as_f64().unwrap_or(0.0);
        if row[1] == "lbs" { v / 2.20462 } else { v }
    };
    let latest_weight = weights.last().map(&kg);
    let mut bmi_hist = vec![];
    if let Some(height) = h.filter(|v| *v > 0.0) {
        for w in &weights {
            let wk = kg(w);
            let bmi = rounded(wk / (height / 100.0).powi(2), 1);
            bmi_hist.push(json!({"date":w[2],"weightKg":rounded(wk,2),"bmi":bmi,"category":bmi_category(bmi)}));
        }
    }
    let mut bmi_data = Value::Null;
    let mut current_bmi = None;
    if let (Some(weight), Some(height)) = (latest_weight, h.filter(|v| *v > 0.0)) {
        let bmi = rounded(weight / (height / 100.0).powi(2), 1);
        current_bmi = Some(bmi);
        let min = rounded(18.5 * (height / 100.0).powi(2), 1);
        let max = rounded(24.9 * (height / 100.0).powi(2), 1);
        let mut c7 = None;
        let mut c30 = None;
        let now = Utc::now().timestamp_millis();
        for b in bmi_hist.iter().rev().skip(1) {
            let dt = b["date"].as_str().and_then(datetime_ms).unwrap_or(i64::MAX);
            if c7.is_none() && dt <= now - 7 * 86400000 {
                c7 = Some(rounded(bmi - b["bmi"].as_f64().unwrap_or(bmi), 1))
            }
            if c30.is_none() && dt <= now - 30 * 86400000 {
                c30 = Some(rounded(bmi - b["bmi"].as_f64().unwrap_or(bmi), 1))
            }
        }
        bmi_data = json!({"value":bmi,"category":bmi_category(bmi),"healthyWeightRangeKg":{"minKg":min,"maxKg":max},"distanceToNormalKg":if weight>max{rounded(weight-max,1)}else if weight<min{rounded(weight-min,1)}else{0.0},"change7d":c7,"change30d":c30,"formula":"BMI = weight(kg) / height(m)²","inputs":{"weightKg":weight,"heightCm":height}})
    }
    let waist = latest.get("waist").copied();
    let neck = latest.get("neck").copied();
    let hips = latest.get("hips").copied();
    let chest = latest.get("chest").copied();
    let navy = match (sex, h, waist, neck, hips) {
        ("male", Some(h), Some(w), Some(n), _) => Some(bodyfat_male(w, n, h)),
        ("female", Some(h), Some(w), Some(n), Some(hips)) => Some(bodyfat_female(w, hips, n, h)),
        _ => None,
    };
    let dbf = current_bmi.map(|b| deurenberg(b, age, sex));
    let preferred = navy.or(dbf);
    let lean = preferred
        .zip(latest_weight)
        .map(|(f, w)| rounded(w - w * f / 100.0, 1));
    let fat = preferred
        .zip(latest_weight)
        .map(|(f, w)| rounded(w * f / 100.0, 1));
    let mut bf_hist = BTreeMap::<String, Value>::new();
    for b in &bmi_hist {
        let date = b["date"]
            .as_str()
            .unwrap_or("")
            .split('T')
            .next()
            .unwrap_or("");
        bf_hist.insert(date.into(),json!({"date":date,"value":deurenberg(b["bmi"].as_f64().unwrap_or(0.0),age,sex),"method":"deurenberg"}));
    }
    let mut mstmt=conn.prepare("SELECT me.recorded_at,me.value,md.slug FROM measurement_entries me JOIN measurement_definitions md ON md.id=me.definition_id WHERE me.profile_id=?1 AND md.slug IN ('waist','neck','hips','height') ORDER BY me.recorded_at ASC,me.created_at ASC").unwrap();
    let mut timeline = BTreeMap::<String, BTreeMap<String, f64>>::new();
    if let Ok(rows) = mstmt.query_map([&p.id], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, f64>(1)?,
            r.get::<_, String>(2)?,
        ))
    }) {
        for (date, val, slug) in rows.flatten() {
            timeline
                .entry(date.split('T').next().unwrap_or("").into())
                .or_default()
                .insert(slug, val);
        }
    }
    let mut carry = BTreeMap::<String, f64>::new();
    for (date, vals) in timeline {
        carry.extend(vals);
        let height = carry.get("height").copied().or(setting_height);
        if let (Some(h), Some(w), Some(n)) = (
            height,
            carry.get("waist").copied(),
            carry.get("neck").copied(),
        ) {
            let bf = if sex == "male" {
                Some(bodyfat_male(w, n, h))
            } else if sex == "female" {
                carry.get("hips").map(|hips| bodyfat_female(w, *hips, n, h))
            } else {
                None
            };
            if let Some(v) = bf {
                bf_hist.insert(date.clone(), json!({"date":date,"value":v,"method":"navy"}));
            }
        }
    }
    let bodyfat_history: Vec<Value> = bf_hist.into_values().collect();
    let whtr=waist.zip(h).map(|(w,h)|{let r=rounded(w/h,2);json!({"ratio":r,"category":if r<0.4{"Take Care (Underweight risk)"}else if r<=0.49{"Healthy (< 0.50)"}else if r<=0.59{"Increased Risk (0.50–0.59)"}else{"High Risk (≥ 0.60)"}})});
    let whr = waist.zip(hips).map(|(w, h)| {
        let r = rounded(w / h, 2);
        let cat = if sex == "female" {
            if r < 0.85 {
                "Normal (< 0.85)"
            } else if r <= 0.89 {
                "Moderate Risk"
            } else {
                "High Risk (≥ 0.90)"
            }
        } else if r < 0.9 {
            "Normal (< 0.90)"
        } else if r <= 0.99 {
            "Moderate Risk"
        } else {
            "High Risk (≥ 1.0)"
        };
        json!({"ratio":r,"category":cat})
    });
    let ctw = chest.zip(waist).map(|(c, w)| rounded(c / w, 2));
    let metabolism=latest_weight.zip(h).map(|(w,h)|{let age=age.clamp(12,100)as f64;let female=sex=="female";let bmr=(10.0*w+6.25*h-5.0*age+if female{-161.0}else{5.0}).round();let tdee=json!({"sedentary":(bmr*1.2).round(),"light":(bmr*1.375).round(),"moderate":(bmr*1.55).round(),"active":(bmr*1.725).round()});let water=if female{-2.097+0.1069*h+0.2466*w}else{2.447-0.09156*age+0.1074*h+0.3362*w}.max(15.0);json!({"bmr":bmr,"tdee":tdee,"waterLiters":rounded(water,1)})});
    let symmetry = |l: &str, r: &str| {
        latest.get(l).zip(latest.get(r)).map(|(l, r)| {
            let diff = rounded((l - r).abs(), 1);
            json!({"left":l,"right":r,"diff":diff,"balanced":diff<=1.0})
        })
    };
    let mut unlocks = vec![];
    if h.is_none() {
        unlocks.push(json!({"metric":"BMI & Body Fat History","missing":["Height"]}))
    }
    if waist.is_none() || neck.is_none() {
        unlocks.push(json!({"metric":"US Navy Body Fat %","missing":["Waist","Neck"]}))
    }
    if sex == "female" && hips.is_none() {
        unlocks.push(json!({"metric":"Female US Navy Body Fat %","missing":["Hips"]}))
    }
    if chest.is_none() || waist.is_none() {
        unlocks.push(json!({"metric":"Chest-to-Waist (V-Taper)","missing":["Chest"]}))
    }
    if (latest.get("left_upper_arm").is_none() || latest.get("right_upper_arm").is_none())
        && (latest.get("left_thigh").is_none() || latest.get("right_thigh").is_none())
    {
        unlocks.push(
            json!({"metric":"Limb Symmetry Balance","missing":["Left & Right Upper Arm / Thigh"]}),
        )
    }
    let navformula = if sex == "male" {
        "US Navy Method (Male): 86.010 × log10(waist − neck) − 70.041 × log10(height) + 36.76"
    } else {
        "US Navy Method (Female): 163.205 × log10(waist + hips − neck) − 97.684 × log10(height) − 78.387"
    };
    let bodyfat=preferred.map(|v|{let category=if sex=="female"{if v<21.0{"Athletic"}else if v<25.0{"Fitness"}else if v<32.0{"Average"}else{"High"}}else if v<14.0{"Athletic"}else if v<18.0{"Fitness"}else if v<25.0{"Average"}else{"High"};json!({"navy":navy.map(|x|json!({"value":x,"formula":navformula})),"deurenberg":dbf.map(|x|json!({"value":x,"formula":"Deurenberg: 1.2 × BMI + 0.23 × Age − 10.8 × Sex − 5.4"})),"preferredValue":v,"category":category,"leanMassKg":lean,"fatMassKg":fat})});
    let latest_date = weights.last().and_then(|w| w[2].as_str());
    Json(json!({"bmi":if bmi_data.is_null(){None::<Value>}else{Some(bmi_data)},"bmiHistory":bmi_hist,"bodyFat":bodyfat,"bodyFatHistory":bodyfat_history,"metabolism":metabolism,"ratios":{"whtr":whtr,"whr":whr,"chestToWaist":ctw},"symmetry":{"arms":symmetry("left_upper_arm","right_upper_arm"),"forearms":symmetry("left_forearm","right_forearm"),"thighs":symmetry("left_thigh","right_thigh"),"calves":symmetry("left_calf","right_calf")},"availableData":{"sex":if sex.is_empty(){None::<&str>}else{Some(sex)},"ageYears":age,"heightCm":h,"waistCm":waist,"neckCm":neck,"hipsCm":hips,"chestCm":chest,"latestWeightKg":latest_weight,"latestWeightRecordedAt":latest_date,"unitSystem":unit},"nextUnlocks":unlocks})).into_response()
}
#[derive(Clone)]
struct AiConfig {
    enabled: bool,
    base_url: String,
    model: String,
    coach_mode: String,
    custom_prompt: String,
    custom_name: String,
    share_name: bool,
    history_limit: i64,
    avatar: Option<String>,
    cipher: Option<Vec<u8>>,
    iv: Option<Vec<u8>>,
    tag: Option<Vec<u8>>,
}
fn ai_config(app: &App, profile: &str) -> Option<AiConfig> {
    db(app).query_row("SELECT enabled,base_url,model,coach_mode,custom_coach_prompt,custom_coach_name,share_user_name,chat_history_limit,coach_avatar_url,api_key_ciphertext,api_key_iv,api_key_tag FROM ai_provider_settings WHERE profile_id=?1",[profile],|r|Ok(AiConfig{enabled:r.get::<_,i64>(0)?!=0,base_url:r.get(1)?,model:r.get(2)?,coach_mode:r.get(3)?,custom_prompt:r.get(4)?,custom_name:r.get(5)?,share_name:r.get::<_,i64>(6)?!=0,history_limit:r.get(7)?,avatar:r.get(8)?,cipher:r.get(9)?,iv:r.get(10)?,tag:r.get(11)?})).optional().ok().flatten()
}
fn ai_key() -> Result<Vec<u8>, String> {
    let raw = env::var("FORMA_AI_ENCRYPTION_KEY")
        .unwrap_or_default()
        .trim()
        .to_owned();
    if raw.is_empty() {
        return Err("FORMA_AI_ENCRYPTION_KEY is missing from the running Forma server. Add it to the container environment and recreate the container.".into());
    }
    let normalized = raw
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>();
    let decoded=BASE64.decode(&normalized).map_err(|_|"FORMA_AI_ENCRYPTION_KEY is invalid. It must be base64 that decodes to exactly 32 bytes.".to_owned())?;
    if decoded.len() != 32
        || BASE64.encode(&decoded).trim_end_matches('=') != normalized.trim_end_matches('=')
    {
        return Err("FORMA_AI_ENCRYPTION_KEY is invalid. It must be base64 that decodes to exactly 32 bytes.".into());
    }
    Ok(decoded)
}
fn ai_encrypt(value: &str) -> Result<(Vec<u8>, Vec<u8>, Vec<u8>), String> {
    use rand::RngCore;
    let key = ai_key()?;
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|_| "Invalid AI encryption key".to_owned())?;
    let mut iv = vec![0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);
    let encrypted = cipher
        .encrypt(Nonce::from_slice(&iv), value.as_bytes())
        .map_err(|_| "Could not encrypt AI API token".to_owned())?;
    let split = encrypted.len().saturating_sub(16);
    Ok((encrypted[..split].to_vec(), iv, encrypted[split..].to_vec()))
}
fn ai_decrypt(config: &AiConfig) -> Result<String, String> {
    let (Some(ct), Some(iv), Some(tag)) = (&config.cipher, &config.iv, &config.tag) else {
        return Err("Add an API token in AI settings first.".into());
    };
    let key = ai_key()?;
    let cipher =
        Aes256Gcm::new_from_slice(&key).map_err(|_| "Invalid AI encryption key".to_owned())?;
    if iv.len() != 12 {
        return Err("Could not decrypt the stored AI API token.".into());
    }
    let mut combined = ct.clone();
    combined.extend(tag);
    let bytes = cipher
        .decrypt(Nonce::from_slice(iv), combined.as_ref())
        .map_err(|_| "Could not decrypt the stored AI API token.".to_owned())?;
    String::from_utf8(bytes).map_err(|_| "Could not decrypt the stored AI API token.".to_owned())
}
fn ai_public(config: Option<AiConfig>) -> Value {
    let ready = ai_key().is_ok();
    let c = config;
    json!({"enabled":c.as_ref().is_some_and(|v|v.enabled),"baseUrl":c.as_ref().map(|v|v.base_url.as_str()).unwrap_or("https://api.openai.com/v1"),"model":c.as_ref().map(|v|v.model.as_str()).unwrap_or(""),"coachMode":c.as_ref().map(|v|v.coach_mode.as_str()).unwrap_or("friend"),"customCoachPrompt":c.as_ref().map(|v|v.custom_prompt.as_str()).unwrap_or(""),"customCoachName":c.as_ref().map(|v|v.custom_name.as_str()).unwrap_or(""),"shareUserName":c.as_ref().is_some_and(|v|v.share_name),"chatHistoryLimit":c.as_ref().map(|v|v.history_limit).unwrap_or(20),"customCoachAvatarUrl":c.as_ref().and_then(|v|v.avatar.clone()),"hasApiKey":c.as_ref().is_some_and(|v|v.cipher.is_some()),"serverEncryptionReady":ready})
}
fn normalize_ai_url(raw: &str) -> Result<String, String> {
    let u = url::Url::parse(raw.trim()).map_err(|_| "Enter a valid AI API base URL.".to_owned())?;
    if !["http", "https"].contains(&u.scheme())
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
    {
        return Err(
            "The AI API URL must be an HTTP(S) base URL without credentials or query parameters."
                .into(),
        );
    }
    let host = u.host_str().unwrap_or("").to_lowercase();
    let ip = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .parse::<std::net::IpAddr>()
        .ok();
    let private = match ip {
        Some(std::net::IpAddr::V4(v)) => {
            v.is_private() || v.is_loopback() || v.is_link_local() || v.is_unspecified()
        }
        Some(std::net::IpAddr::V6(v)) => {
            v.is_loopback()
                || v.is_unique_local()
                || v.is_unicast_link_local()
                || v.is_unspecified()
        }
        None => host.ends_with(".local") || host.ends_with(".internal"),
    };
    let loopback = host == "localhost"
        || host == "127.0.0.1"
        || host == "[::1]"
        || ip.is_some_and(|v| v.is_loopback());
    if private && !loopback {
        return Err(
            "Private network provider URLs are not allowed. Use a public HTTPS provider URL."
                .into(),
        );
    }
    if u.scheme() == "http"
        && !loopback
        && env::var("FORMA_AI_ALLOW_HTTP_BASE_URL").as_deref() != Ok("true")
    {
        return Err("Use HTTPS for remote AI providers. HTTP is limited to localhost unless the server administrator enables it.".into());
    }
    let out = u.as_str().trim_end_matches('/').to_owned();
    Ok(out)
}
async fn ai_settings_get(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    Json(ai_public(ai_config(&app, &p.id))).into_response()
}
async fn ai_settings_put(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    for (k, max) in [
        ("baseUrl", 512usize),
        ("model", 128),
        ("apiKey", 512),
        ("customCoachPrompt", 8000),
        ("customCoachName", 48),
    ] {
        if input
            .get(k)
            .and_then(Value::as_str)
            .is_some_and(|v| v.len() > max)
        {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error":"Validation failed","issues":[]})),
            )
                .into_response();
        }
    }
    let current = ai_config(&app, &p.id);
    let enabled = input
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(current.as_ref().is_some_and(|c| c.enabled));
    let base = match normalize_ai_url(
        input
            .get("baseUrl")
            .and_then(Value::as_str)
            .or(current.as_ref().map(|c| c.base_url.as_str()))
            .unwrap_or("https://api.openai.com/v1"),
    ) {
        Ok(v) => v,
        Err(e) => return error(StatusCode::BAD_REQUEST, &e),
    };
    let model = input
        .get("model")
        .and_then(Value::as_str)
        .map(str::trim)
        .or(current.as_ref().map(|c| c.model.trim()))
        .unwrap_or("");
    let mode = input
        .get("coachMode")
        .and_then(Value::as_str)
        .or(current.as_ref().map(|c| c.coach_mode.as_str()))
        .unwrap_or("friend");
    let prompt = input
        .get("customCoachPrompt")
        .and_then(Value::as_str)
        .or(current.as_ref().map(|c| c.custom_prompt.as_str()))
        .unwrap_or("");
    let name = input
        .get("customCoachName")
        .and_then(Value::as_str)
        .map(str::trim)
        .or(current.as_ref().map(|c| c.custom_name.trim()))
        .unwrap_or("");
    let share = input
        .get("shareUserName")
        .and_then(Value::as_bool)
        .unwrap_or(current.as_ref().is_some_and(|c| c.share_name));
    let history = input
        .get("chatHistoryLimit")
        .and_then(Value::as_i64)
        .unwrap_or(current.as_ref().map(|c| c.history_limit).unwrap_or(20));
    if !["experienced", "friend", "edgy", "custom"].contains(&mode) || history < 4 || history > 100
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    }
    if enabled && model.is_empty() {
        return error(
            StatusCode::BAD_REQUEST,
            "Choose a model before enabling AI features.",
        );
    }
    if mode == "custom" && prompt.trim().is_empty() {
        return error(
            StatusCode::BAD_REQUEST,
            "Add a custom coach prompt or choose a preset.",
        );
    }
    let encrypted = if let Some(key) = input
        .get("apiKey")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        match ai_encrypt(key) {
            Ok(v) => Some(v),
            Err(e) => return error(StatusCode::SERVICE_UNAVAILABLE, &e),
        }
    } else {
        None
    };
    if enabled && encrypted.is_none() && current.as_ref().is_none_or(|c| c.cipher.is_none()) {
        return error(
            StatusCode::BAD_REQUEST,
            "Add an API token before enabling AI features.",
        );
    }
    let (ct, iv, tag) = encrypted
        .map(|(a, b, c)| (Some(a), Some(b), Some(c)))
        .unwrap_or((None, None, None));
    let conn = db(&app);
    if conn.execute("INSERT INTO ai_provider_settings(profile_id,enabled,base_url,model,coach_mode,custom_coach_prompt,api_key_ciphertext,api_key_iv,api_key_tag,chat_history_limit,custom_coach_name,share_user_name,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,datetime('now')) ON CONFLICT(profile_id) DO UPDATE SET enabled=excluded.enabled,base_url=excluded.base_url,model=excluded.model,coach_mode=excluded.coach_mode,custom_coach_prompt=excluded.custom_coach_prompt,chat_history_limit=excluded.chat_history_limit,custom_coach_name=excluded.custom_coach_name,share_user_name=excluded.share_user_name,api_key_ciphertext=COALESCE(excluded.api_key_ciphertext,ai_provider_settings.api_key_ciphertext),api_key_iv=COALESCE(excluded.api_key_iv,ai_provider_settings.api_key_iv),api_key_tag=COALESCE(excluded.api_key_tag,ai_provider_settings.api_key_tag),updated_at=datetime('now')",params![p.id,i64::from(enabled),base,model,mode,prompt,ct,iv,tag,history,name,i64::from(share)]).is_err(){return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")}
    drop(conn);
    Json(ai_public(ai_config(&app, &p.id))).into_response()
}
async fn ai_remove_key(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let _=db(&app).execute("UPDATE ai_provider_settings SET enabled=0,api_key_ciphertext=NULL,api_key_iv=NULL,api_key_tag=NULL,updated_at=datetime('now') WHERE profile_id=?1",[&p.id]);
    Json(ai_public(ai_config(&app, &p.id))).into_response()
}
async fn ai_memory_get(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let row = db(&app)
        .query_row(
            "SELECT summary,updated_at FROM ai_chat_memory WHERE profile_id=?1",
            [&p.id],
            |r| Ok(json!({"summary":r.get::<_,String>(0)?,"updatedAt":r.get::<_,String>(1)?})),
        )
        .optional()
        .ok()
        .flatten();
    Json(row.unwrap_or(json!({"summary":"","updatedAt":null}))).into_response()
}
async fn ai_memory_put(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let Some(summary) = input
        .get("summary")
        .and_then(Value::as_str)
        .filter(|v| v.len() <= 12000)
    else {
        return error(
            StatusCode::BAD_REQUEST,
            "Memory must be 12,000 characters or fewer.",
        );
    };
    if db(&app).execute("INSERT INTO ai_chat_memory(profile_id,summary,updated_at) VALUES(?1,?2,datetime('now')) ON CONFLICT(profile_id) DO UPDATE SET summary=excluded.summary,updated_at=datetime('now')",params![p.id,summary.trim()]).is_err(){return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")}
    ai_memory_get(State(app), Some(axum::extract::Extension(session))).await
}
async fn ai_chat_get(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let rows = json_rows(
        &db(&app),
        "SELECT json_object('id',id,'role',role,'content',content,'createdAt',created_at) FROM (SELECT id,role,content,created_at,sequence FROM ai_chat_messages WHERE profile_id=?1 ORDER BY sequence DESC LIMIT 100) ORDER BY sequence ASC",
        &p.id,
    );
    Json(rows).into_response()
}
async fn ai_chat_clear(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let _ = db(&app).execute("DELETE FROM ai_chat_messages WHERE profile_id=?1", [p.id]);
    Json(json!({"ok":true})).into_response()
}
async fn ai_reports_get(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    Json(json_rows(&db(&app),"SELECT json_object('id',id,'weekStart',week_start,'weekEnd',week_end,'content',content,'createdAt',created_at) FROM ai_weekly_reports WHERE profile_id=?1 ORDER BY created_at DESC LIMIT 30",&p.id)).into_response()
}
async fn ai_report_delete(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    if db(&app)
        .execute(
            "DELETE FROM ai_weekly_reports WHERE id=?1 AND profile_id=?2",
            params![id, p.id],
        )
        .unwrap_or(0)
        == 0
    {
        return error(StatusCode::NOT_FOUND, "Weekly report not found.");
    }
    Json(json!({"ok":true})).into_response()
}
async fn ai_chat_delete_one(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let target = db(&app)
        .query_row(
            "SELECT role,sequence FROM ai_chat_messages WHERE id=?1 AND profile_id=?2",
            params![id, p.id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)),
        )
        .optional()
        .ok()
        .flatten();
    let Some((role, sequence)) = target else {
        return error(StatusCode::NOT_FOUND, "Message not found.");
    };
    let mut deleted = vec![id.clone()];
    if role == "user" {
        if let Some(answer)=db(&app).query_row("SELECT id FROM ai_chat_messages WHERE profile_id=?1 AND role='assistant' AND sequence>?2 ORDER BY sequence ASC LIMIT 1",params![p.id,sequence],|r|r.get::<_,String>(0)).optional().ok().flatten(){deleted.push(answer)}
    }
    for did in &deleted {
        let _ = db(&app).execute(
            "DELETE FROM ai_chat_messages WHERE id=?1 AND profile_id=?2",
            params![did, p.id],
        );
    }
    Json(json!({"ok":true,"deletedIds":deleted})).into_response()
}
fn ai_instructions(c: &AiConfig) -> String {
    let safety = "Fixed coaching boundaries:\n- Be weight-inclusive and respectful. Never shame, demean, or moralize body size, food, or missed sessions.\n- Offer training education and general exercise suggestions, not diagnosis, treatment, or medication advice.\n- Adapt suggestions to the person's experience, stated goals, equipment, mobility, pain, and recovery.\n- Favor gradual progression, manageable effort, rest, and low-impact alternatives when appropriate.\n- If the user reports urgent symptoms, stop training advice and recommend urgent professional care.\n- Use only supplied health context. Account name, username, biography, avatar, and progress photos are deliberately excluded.\n- If data is missing, say so rather than inventing facts.";
    match c.coach_mode.as_str() {
        "custom" => c.custom_prompt.trim().to_owned(),
        "experienced" => format!(
            "You are an experienced gym coach. Be practical, direct, and specific about progressive resistance training. Follow the user's profile and stated goals.\n\n{safety}"
        ),
        "edgy" => format!(
            "You are a high-energy, witty gym coach. Be bold and playful, but never insult or shame the user. Keep advice practical and respectful.\n\n{safety}"
        ),
        _ => format!(
            "You are a knowledgeable, encouraging training friend: warm, patient, honest, and easy to talk to. Explain training ideas in plain language.\n\n{safety}"
        ),
    }
}
async fn ai_completion(
    c: &AiConfig,
    key: &str,
    messages: Vec<Value>,
    max_tokens: u32,
) -> Result<String, (StatusCode, String)> {
    let base = normalize_ai_url(&c.base_url).map_err(|e| (StatusCode::BAD_REQUEST, e))?;
    let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(120)).build().map_err(|_|(StatusCode::BAD_GATEWAY,"Could not connect to the configured AI provider. Check the base URL and server network connection.".into()))?;
    let response=client.post(format!("{base}/chat/completions")).bearer_auth(key).header("Accept","application/json").json(&json!({"model":c.model,"messages":messages,"temperature":0.6,"max_tokens":max_tokens})).send().await.map_err(|e|{if e.is_timeout(){(StatusCode::GATEWAY_TIMEOUT,"The AI provider request timed out. Try again or use a provider with a faster response.".into())}else{(StatusCode::BAD_GATEWAY,"Could not connect to the configured AI provider. Check the base URL and server network connection.".into())}})?;
    if !response.status().is_success() {
        let s = response.status().as_u16();
        let msg=match s{401|403=>format!("The AI provider rejected the API token (HTTP {s}). Check the token and provider account."),404=>"The AI provider could not find the configured endpoint or model (HTTP 404). Check the base URL and model ID.".into(),429=>"The AI provider rate limited this request (HTTP 429). Check your provider quota or try again later.".into(),500..=599=>format!("The AI provider is unavailable (HTTP {s}). Try again later."),_=>format!("The AI provider rejected the request (HTTP {s}). Check that the model supports Chat Completions.")};
        return Err((StatusCode::BAD_GATEWAY, msg));
    }
    let data: Value = response.json().await.map_err(|_| {
        (
            StatusCode::BAD_GATEWAY,
            "The AI provider returned an invalid response.".into(),
        )
    })?;
    let choice = &data["choices"][0];
    let content = &choice["message"]["content"];
    let text = if let Some(s) = content.as_str() {
        s.to_owned()
    } else if let Some(parts) = content.as_array() {
        parts
            .iter()
            .filter_map(|p| p["text"].as_str())
            .collect::<String>()
    } else {
        String::new()
    };
    if !text.trim().is_empty() {
        return Ok(text.trim().to_owned());
    }
    let detail = if choice["finish_reason"] == "length" {
        " The response reached its token limit before producing text; increase the output token limit or use a non-reasoning model."
    } else if choice["message"]["tool_calls"]
        .as_array()
        .is_some_and(|v| !v.is_empty())
    {
        " The model returned a tool call, which Forma does not support."
    } else if !choice["message"]["reasoning"].is_null() {
        " The model returned reasoning without a text answer; try a model that returns a final chat message."
    } else {
        ""
    };
    Err((
        StatusCode::BAD_GATEWAY,
        format!("The AI provider returned an empty response.{detail}"),
    ))
}
fn ai_usable(app: &App, id: &str) -> Result<(AiConfig, String), String> {
    let c = ai_config(app, id).ok_or("Enable AI features in AI settings first.")?;
    if !c.enabled {
        return Err("Enable AI features in AI settings first.".into());
    }
    if c.model.trim().is_empty() {
        return Err("Choose an AI model in AI settings first.".into());
    }
    if c.cipher.is_none() {
        return Err("Add an API token in AI settings first.".into());
    }
    let key = ai_decrypt(&c)?;
    Ok((c, key))
}
async fn ai_models(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let current = ai_config(&app, &p.id);
    let raw = input
        .get("baseUrl")
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .or(current.as_ref().map(|c| c.base_url.as_str()));
    let Some(raw) = raw else {
        return error(StatusCode::BAD_REQUEST, "Enter an API base URL first.");
    };
    let base = match normalize_ai_url(raw) {
        Ok(s) => s,
        Err(e) => return error(StatusCode::BAD_REQUEST, &e),
    };
    let key = if let Some(key) = input
        .get("apiKey")
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
    {
        key.trim().to_owned()
    } else if let Some(c) = current.as_ref().filter(|c| c.cipher.is_some()) {
        match ai_decrypt(c) {
            Ok(k) => k,
            Err(e) => return error(StatusCode::SERVICE_UNAVAILABLE, &e),
        }
    } else {
        return error(StatusCode::BAD_REQUEST, "Enter an API token first.");
    };
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap();
    let response = match client
        .get(format!("{base}/models"))
        .bearer_auth(key)
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => {
            return error(
                StatusCode::BAD_GATEWAY,
                "Could not load models from the provider. Check the URL and server network connection.",
            );
        }
    };
    if !response.status().is_success() {
        let s = response.status().as_u16();
        let msg = if s == 401 || s == 403 {
            format!("The provider rejected the API token (HTTP {s}). Check the token.")
        } else if s == 404 {
            "The provider does not expose a compatible models endpoint. Enter a model ID manually."
                .into()
        } else {
            format!("The provider could not list models (HTTP {s}). Enter a model ID manually.")
        };
        return error(StatusCode::BAD_GATEWAY, &msg);
    }
    let data: Value = response.json().await.unwrap_or(Value::Null);
    let mut models = data["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|m| {
            m["id"]
                .as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
        })
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    models.truncate(1000);
    Json(json!({"models":models})).into_response()
}
async fn ai_test(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let Some(c) = ai_config(&app, &p.id) else {
        return error(StatusCode::BAD_REQUEST, "Save AI provider settings first.");
    };
    let key = match ai_decrypt(&c) {
        Ok(k) => k,
        Err(e) => {
            return error(
                if e.contains("FORMA_AI_ENCRYPTION_KEY") {
                    StatusCode::SERVICE_UNAVAILABLE
                } else {
                    StatusCode::BAD_GATEWAY
                },
                &e,
            );
        }
    };
    match ai_completion(
        &c,
        &key,
        vec![json!({"role":"user","content":"Reply with the single word OK."})],
        256,
    )
    .await
    {
        Ok(_) => Json(json!({"ok":true})).into_response(),
        Err((s, e)) => error(s, &e),
    }
}
async fn ai_chat_post(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let Some(message) = input
        .get("message")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|m| !m.is_empty() && m.len() <= 4000)
    else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"Validation failed","issues":[]})),
        )
            .into_response();
    };
    let (c, key) = match ai_usable(&app, &p.id) {
        Ok(v) => v,
        Err(e) => return error(StatusCode::BAD_REQUEST, &e),
    };
    let history=json_rows(&db(&app),"SELECT json_array(role,content) FROM (SELECT role,content,sequence FROM ai_chat_messages WHERE profile_id=?1 ORDER BY sequence DESC LIMIT 100) ORDER BY sequence ASC",&p.id).as_array().cloned().unwrap_or_default();
    let memory = db(&app)
        .query_row(
            "SELECT summary FROM ai_chat_memory WHERE profile_id=?1",
            [&p.id],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or_default();
    let identity = if c.coach_mode == "custom"
        && c.share_name
        && p.display_name
            .as_ref()
            .is_some_and(|n| !n.trim().is_empty())
    {
        format!(
            "The user has opted to share their display name: {}. Use it naturally. Usernames, biographies, and photos remain excluded.",
            serde_json::to_string(p.display_name.as_ref().unwrap()).unwrap_or_default()
        )
    } else {
        "The user’s name, username, biography, and photos are excluded.".into()
    };
    let context = json!({"profile":{"sex":db(&app).query_row("SELECT value FROM settings WHERE profile_id=?1 AND key='sex'",[&p.id],|r|r.get::<_,String>(0)).optional().ok().flatten(),"heightCm":db(&app).query_row("SELECT value FROM settings WHERE profile_id=?1 AND key='height_cm'",[&p.id],|r|r.get::<_,String>(0)).optional().ok().flatten()},"recentWeights":json_rows(&db(&app),"SELECT json_object('value',value,'unit',unit,'recorded_at',recorded_at,'notes',notes) FROM weight_entries WHERE profile_id=?1 ORDER BY recorded_at DESC LIMIT 100",&p.id),"measurementHistory":json_rows(&db(&app),"SELECT json_object('site',md.name,'slug',md.slug,'unit',md.unit,'isCustom',CASE WHEN md.is_system=1 THEN json('false') ELSE json('true') END,'value',me.value,'recorded_at',me.recorded_at,'notes',me.notes) FROM measurement_entries me JOIN measurement_definitions md ON md.id=me.definition_id WHERE me.profile_id=?1 ORDER BY me.recorded_at DESC LIMIT 200",&p.id)});
    let mut messages = vec![
        json!({"role":"system","content":format!("{}\n\n{}\nComplete health context; use supplied measurement names, units, and history.\n{}\nConversation memory: {}",ai_instructions(&c),identity,context,memory)}),
    ];
    for pair in history {
        if let Some(a) = pair.as_array() {
            if a.len() == 2 {
                messages.push(json!({"role":a[0],"content":a[1]}))
            }
        }
    }
    messages.push(json!({"role":"user","content":message}));
    let content = match ai_completion(&c, &key, messages, 1400).await {
        Ok(s) => s,
        Err((s, e)) => return error(s, &e),
    };
    let uid = new_id();
    let aid = new_id();
    let mut conn = db(&app);
    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"),
    };
    let next: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(sequence),0) FROM ai_chat_messages WHERE profile_id=?1",
            [&p.id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if tx.execute("INSERT INTO ai_chat_messages(id,profile_id,role,content,sequence) VALUES(?1,?2,'user',?3,?4)",params![uid,p.id,message,next+1]).is_err()||tx.execute("INSERT INTO ai_chat_messages(id,profile_id,role,content,sequence) VALUES(?1,?2,'assistant',?3,?4)",params![aid,p.id,content,next+2]).is_err(){return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")}
    let _=tx.execute("DELETE FROM ai_chat_messages WHERE profile_id=?1 AND id NOT IN(SELECT id FROM ai_chat_messages WHERE profile_id=?1 ORDER BY sequence DESC LIMIT 100)",[&p.id]);
    if tx.commit().is_err() {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
    }
    Json(json!({"id":aid,"userMessageId":uid,"role":"assistant","content":content})).into_response()
}
async fn ai_memory_generate(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let (c, key) = match ai_usable(&app, &p.id) {
        Ok(v) => v,
        Err(e) => return error(StatusCode::BAD_REQUEST, &e),
    };
    let history = json_rows(
        &db(&app),
        "SELECT json_array(role,content) FROM (SELECT role,content,sequence FROM ai_chat_messages WHERE profile_id=?1 ORDER BY sequence DESC LIMIT 100) ORDER BY sequence ASC",
        &p.id,
    );
    let Some(messages) = history.as_array().filter(|a| a.len() >= 4) else {
        return error(
            StatusCode::BAD_REQUEST,
            "Have a few more chat messages with your coach before generating a memory.",
        );
    };
    let previous = db(&app)
        .query_row(
            "SELECT summary FROM ai_chat_memory WHERE profile_id=?1",
            [&p.id],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or_default();
    let conversation = messages
        .iter()
        .filter_map(|m| m.as_array())
        .filter(|m| m.len() == 2)
        .map(|m| json!({"role":m[0],"content":m[1]}))
        .collect::<Vec<_>>();
    let content = json!({"existingMemory":previous,"recentConversation":conversation});
    let prompt = "Create a concise, durable conversation memory for a personal training coach. Keep useful user-shared goals, preferences, constraints, equipment, experience, ongoing plans, and unresolved questions. Update existing memory with the new conversation: retain relevant details, replace outdated ones, remove details no longer useful. Do not include account names or identifiers. Write only the memory itself in plain language, under 1,200 words.";
    let summary = match ai_completion(
        &c,
        &key,
        vec![
            json!({"role":"system","content":prompt}),
            json!({"role":"user","content":content.to_string()}),
        ],
        1800,
    )
    .await
    {
        Ok(v) => v,
        Err((s, e)) => return error(s, &e),
    };
    let _=db(&app).execute("INSERT INTO ai_chat_memory(profile_id,summary,updated_at) VALUES(?1,?2,datetime('now')) ON CONFLICT(profile_id) DO UPDATE SET summary=excluded.summary,updated_at=datetime('now')",params![p.id,summary]);
    ai_memory_get(State(app), Some(axum::extract::Extension(session))).await
}
async fn ai_weekly_report(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let (c, key) = match ai_usable(&app, &p.id) {
        Ok(v) => v,
        Err(e) => return error(StatusCode::BAD_REQUEST, &e),
    };
    let end = Utc::now().date_naive();
    let start = end - chrono::Duration::days(6);
    let prev_start = end - chrono::Duration::days(13);
    let prev_end = end - chrono::Duration::days(7);
    let fmt = |d: chrono::NaiveDate| d.format("%Y-%m-%d").to_string();
    let snap = |from: chrono::NaiveDate, to: chrono::NaiveDate| {
        let f = fmt(from);
        let t = fmt(to);
        let next = fmt(to + chrono::Duration::days(1));
        let lo = format!("{f}T00:00:00");
        let hi = format!("{next}T00:00:00");
        json!({
            "period":{"from":f,"to":t},
            "weights":json_rows_range(&db(&app),"SELECT json_object('value',value,'unit',unit,'recorded_at',recorded_at) FROM weight_entries WHERE profile_id=?1 AND recorded_at>=?2 AND recorded_at<?3 ORDER BY recorded_at ASC",&p.id,&lo,&hi),
            "measurements":json_rows_range(&db(&app),"SELECT json_object('site',md.name,'unit',md.unit,'isCustom',CASE WHEN md.is_system=1 THEN json('false') ELSE json('true') END,'value',me.value,'recorded_at',me.recorded_at) FROM measurement_entries me JOIN measurement_definitions md ON md.id=me.definition_id WHERE me.profile_id=?1 AND me.recorded_at>=?2 AND me.recorded_at<?3 ORDER BY me.recorded_at ASC",&p.id,&lo,&hi),
            "nutritionLogs":json_rows_range(&db(&app),"SELECT json_object('date',date,'calories',calories,'protein_grams',protein_grams,'carbs_grams',carbs_grams,'fat_grams',fat_grams) FROM daily_nutrition_logs WHERE profile_id=?1 AND date BETWEEN ?2 AND ?3 ORDER BY date ASC",&p.id,&f,&t),
            "fastingSessions":json_rows_range(&db(&app),"SELECT json_object('fast_type',fast_type,'target_duration_hours',target_duration_hours,'started_at',started_at,'ended_at',ended_at,'status',status,'mood',mood) FROM fasting_sessions WHERE profile_id=?1 AND started_at>=?2 AND started_at<?3 AND (status!='completed' OR (ended_at IS NOT NULL AND (julianday(ended_at)-julianday(started_at))*24>=8)) ORDER BY started_at ASC",&p.id,&lo,&hi)
        })
    };
    let snapshot = json!({"latestWeek":snap(start,end),"previousWeek":snap(prev_start,prev_end)});
    let report_prompt = "Write the coaching narrative for a weekly progress report in the selected coach voice. Interpret direction and reliability of signals, recognize a real win or useful pattern, and suggest practical focus for next week. Use only supplied records; do not repeat metrics. Return exactly headings ## Coach's read, ## Wins & patterns, ## Your focus this week, ## Overall summary, in that order. The first three sections each have one or two concise bullets. Give one to three realistic specific actions in the focus section. Overall summary is one encouraging paragraph. Do not diagnose, shame, moralize, or invent data.";
    let narrative=match ai_completion(&c,&key,vec![json!({"role":"system","content":format!("{}\n\n{}",ai_instructions(&c),report_prompt)}),json!({"role":"user","content":snapshot.to_string()})],1400).await{Ok(v)=>v,Err((s,e))=>return error(s,&e)};
    let metrics = report_metrics(&snapshot["latestWeek"], &snapshot["previousWeek"]);
    let content = format!("{narrative}\n\n## Metrics\n\n{metrics}");
    let id = new_id();
    let f = fmt(start);
    let t = fmt(end);
    if db(&app).execute("INSERT INTO ai_weekly_reports(id,profile_id,week_start,week_end,content) VALUES(?1,?2,?3,?4,?5)",params![id,p.id,f,t,content]).is_err(){return error(StatusCode::INTERNAL_SERVER_ERROR,"Internal server error")}
    Json(json!({"id":id,"weekStart":f,"weekEnd":t,"content":content})).into_response()
}
fn report_number(v: f64) -> String {
    if v.fract() == 0.0 {
        format!("{v:.0}")
    } else {
        format!("{v:.1}")
    }
}
fn report_metric(
    label: &str,
    latest: Option<f64>,
    previous: Option<f64>,
    unit: &str,
    lc: Option<usize>,
    pc: Option<usize>,
) -> String {
    let value = |v: Option<f64>, n: Option<usize>| {
        v.map(|x| {
            format!(
                "{}{}{}",
                report_number(x),
                if unit.is_empty() {
                    String::new()
                } else {
                    format!(" {unit}")
                },
                n.map(|c| format!(" ({c} {})", if c == 1 { "reading" } else { "readings" }))
                    .unwrap_or_default()
            )
        })
        .unwrap_or_else(|| "No data".into())
    };
    let change = match (latest, previous) {
        (Some(a), Some(b)) if a == b => "No change".into(),
        (Some(a), Some(b)) => format!(
            "{} {}{}",
            if a < b { "↓" } else { "↑" },
            report_number((a - b).abs()),
            if unit.is_empty() {
                String::new()
            } else {
                format!(" {unit}")
            }
        ),
        (Some(_), None) => "New data this week".into(),
        (None, Some(_)) => "No data this week".into(),
        _ => "Not enough data to compare".into(),
    };
    format!(
        "| {label} | {} | {} | {change} |",
        value(latest, lc),
        value(previous, pc)
    )
}
fn report_metrics(latest: &Value, previous: &Value) -> String {
    let avg = |items: &[Value], select: fn(&Value) -> Option<f64>| {
        let vals: Vec<f64> = items.iter().filter_map(select).collect();
        if vals.is_empty() {
            None
        } else {
            Some(vals.iter().sum::<f64>() / vals.len() as f64)
        }
    };
    let lw = latest["weights"].as_array().cloned().unwrap_or_default();
    let pw = previous["weights"].as_array().cloned().unwrap_or_default();
    let unit = lw
        .first()
        .or(pw.first())
        .and_then(|v| v["unit"].as_str())
        .unwrap_or("");
    let lwu: Vec<Value> = lw.iter().filter(|v| v["unit"] == unit).cloned().collect();
    let pwu: Vec<Value> = pw.iter().filter(|v| v["unit"] == unit).cloned().collect();
    let mut rows = vec![report_metric(
        "Weight",
        avg(&lwu, |v| v["value"].as_f64()),
        avg(&pwu, |v| v["value"].as_f64()),
        unit,
        Some(lwu.len()),
        Some(pwu.len()),
    )];
    let group = |items: &[Value]| {
        let mut map = BTreeMap::<String, (String, Vec<f64>)>::new();
        for v in items {
            let site = v["site"].as_str().unwrap_or("").to_owned();
            let unit = v["unit"].as_str().unwrap_or("").to_owned();
            if let Some(n) = v["value"].as_f64() {
                let entry = map.entry(site).or_insert((unit, Vec::new()));
                entry.1.push(n)
            }
        }
        map
    };
    let lm = group(
        latest["measurements"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or(&[]),
    );
    let pm = group(
        previous["measurements"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or(&[]),
    );
    for (site, (u, values)) in &lm {
        let prior = pm.get(site);
        rows.push(report_metric(
            site,
            Some(values.iter().sum::<f64>() / values.len() as f64),
            prior.map(|(_, vs)| vs.iter().sum::<f64>() / vs.len() as f64),
            u,
            Some(values.len()),
            prior.map(|(_, vs)| vs.len()),
        ))
    }
    for (site, (u, values)) in &pm {
        if !lm.contains_key(site) {
            rows.push(report_metric(
                site,
                None,
                Some(values.iter().sum::<f64>() / values.len() as f64),
                u,
                Some(0),
                Some(values.len()),
            ))
        }
    }
    let ll = latest["nutritionLogs"]
        .as_array()
        .map(Vec::len)
        .unwrap_or(0);
    let pl = previous["nutritionLogs"]
        .as_array()
        .map(Vec::len)
        .unwrap_or(0);
    rows.push(report_metric(
        "Nutrition logs",
        Some(ll as f64),
        Some(pl as f64),
        "days",
        None,
        None,
    ));
    let completed = |v: &Value| {
        v["fastingSessions"]
            .as_array()
            .map(|a| a.iter().filter(|s| s["status"] == "completed").count())
            .unwrap_or(0)
    };
    rows.push(report_metric(
        "Completed fasting sessions",
        Some(completed(latest) as f64),
        Some(completed(previous) as f64),
        "sessions",
        None,
        None,
    ));
    format!(
        "| Metric | Latest Week | Previous Week | Change |\n| --- | --- | --- | --- |\n{}",
        rows.join("\n")
    )
}
async fn ai_coach_avatar_upload(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    mut multipart: Multipart,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    let mut file = None;
    let mut mime = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        let mt = field.content_type().unwrap_or("").to_owned();
        if uploaded_ext(&mt).is_none() {
            continue;
        }
        let bytes = field.bytes().await.unwrap_or_default();
        if bytes.len() > 5 * 1024 * 1024 {
            return error(
                StatusCode::PAYLOAD_TOO_LARGE,
                "Coach avatar must be 5 MB or smaller.",
            );
        }
        file = Some(bytes);
        mime = Some(mt);
        break;
    }
    let (Some(bytes), Some(mt)) = (file, mime) else {
        return error(StatusCode::BAD_REQUEST, "Choose an image to upload.");
    };
    let root = photos_root().join("coach-avatars");
    if std::fs::create_dir_all(&root).is_err() {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
    }
    let name = format!("coach_{}.{}", new_id(), uploaded_ext(&mt).unwrap());
    if std::fs::write(root.join(&name), bytes).is_err() {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
    }
    let url = format!("/api/ai/coach-avatar/{name}");
    let _=db(&app).execute("INSERT INTO ai_provider_settings(profile_id,coach_avatar_url) VALUES(?1,?2) ON CONFLICT(profile_id) DO UPDATE SET coach_avatar_url=excluded.coach_avatar_url",params![p.id,url]);
    Json(json!({"coachAvatarUrl":url})).into_response()
}
async fn ai_coach_avatar_delete(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    if let Some(c) = ai_config(&app, &p.id) {
        if let Some(url) = c.avatar {
            if let Some(name) = url.rsplit('/').next() {
                let _ = std::fs::remove_file(photos_root().join("coach-avatars").join(name));
            }
        }
        let _ = db(&app).execute(
            "UPDATE ai_provider_settings SET coach_avatar_url=NULL WHERE profile_id=?1",
            [p.id],
        );
    }
    Json(json!({"ok":true})).into_response()
}
async fn ai_coach_avatar_file(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(filename): RoutePath<String>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    if filename.contains('/')
        || filename.contains('\\')
        || filename.contains("..")
        || ai_config(&app, &p.id).and_then(|c| c.avatar).as_deref()
            != Some(&format!("/api/ai/coach-avatar/{filename}"))
    {
        return error(StatusCode::NOT_FOUND, "Coach avatar not found.");
    }
    let bytes = match std::fs::read(photos_root().join("coach-avatars").join(&filename)) {
        Ok(b) => b,
        Err(_) => return error(StatusCode::NOT_FOUND, "Coach avatar not found."),
    };
    let ct = match filename.rsplit('.').next().unwrap_or("") {
        "png" => "image/png",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };
    let mut response = Response::new(Body::from(bytes));
    response
        .headers_mut()
        .insert(header::CONTENT_TYPE, HeaderValue::from_static(ct));
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, max-age=3600"),
    );
    response
}
async fn ai_chat_edit(
    State(app): State<App>,
    session: Option<axum::extract::Extension<Option<String>>>,
    RoutePath(id): RoutePath<String>,
    ApiJson(input): ApiJson<Value>,
) -> Response {
    let session = session.map(|s| s.0).unwrap_or(None);
    let Ok(p) = auth_or_response(&app, &session) else {
        return error(StatusCode::UNAUTHORIZED, "Unauthorized");
    };
    if let Some(content) = input.get("content").and_then(Value::as_str) {
        let content = content.trim();
        if content.is_empty() || content.len() > 4000 {
            return error(
                StatusCode::BAD_REQUEST,
                "Message must be 1 to 4,000 characters.",
            );
        }
        let Some(c) = ai_config(&app, &p.id) else {
            return error(
                StatusCode::FORBIDDEN,
                "AI replies can only be edited in Custom personality mode.",
            );
        };
        if c.coach_mode != "custom" {
            return error(
                StatusCode::FORBIDDEN,
                "AI replies can only be edited in Custom personality mode.",
            );
        }
        let changed=db(&app).execute("UPDATE ai_chat_messages SET content=?1 WHERE id=?2 AND profile_id=?3 AND role='assistant'",params![content,id,p.id]).unwrap_or(0);
        if changed == 0 {
            return error(StatusCode::NOT_FOUND, "AI reply not found.");
        }
        return Json(json!({"id":id,"role":"assistant","content":content})).into_response();
    }
    let Some(message) = input
        .get("message")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|m| !m.is_empty() && m.len() <= 4000)
    else {
        return error(
            StatusCode::BAD_REQUEST,
            "Message must be 1 to 4,000 characters.",
        );
    };
    let (c, key) = match ai_usable(&app, &p.id) {
        Ok(v) => v,
        Err(e) => return error(StatusCode::BAD_REQUEST, &e),
    };
    let last=db(&app).query_row("SELECT id,sequence FROM ai_chat_messages WHERE profile_id=?1 AND role='user' ORDER BY sequence DESC LIMIT 1",[&p.id],|r|Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?))).optional().ok().flatten();
    let Some((last_id, seq)) = last else {
        return error(
            StatusCode::BAD_REQUEST,
            "Only your most recent message can be edited and regenerated.",
        );
    };
    if last_id != id {
        return error(
            StatusCode::BAD_REQUEST,
            "Only your most recent message can be edited and regenerated.",
        );
    }
    let history = json_rows_range(
        &db(&app),
        "SELECT json_array(role,content) FROM (SELECT role,content,sequence FROM ai_chat_messages WHERE profile_id=?1 AND sequence<?2 ORDER BY sequence DESC LIMIT ?3) ORDER BY sequence ASC",
        &p.id,
        &seq.to_string(),
        &c.history_limit.to_string(),
    );
    let mut messages = vec![
        json!({"role":"system","content":format!("{}\n\nThe user's name, username, biography, and photos are excluded.",ai_instructions(&c))}),
    ];
    for pair in history.as_array().cloned().unwrap_or_default() {
        if let Some(a) = pair.as_array() {
            messages.push(json!({"role":a[0],"content":a[1]}))
        }
    }
    messages.push(json!({"role":"user","content":message}));
    let content = match ai_completion(&c, &key, messages, 1400).await {
        Ok(v) => v,
        Err((s, e)) => return error(s, &e),
    };
    let answer=db(&app).query_row("SELECT id FROM ai_chat_messages WHERE profile_id=?1 AND role='assistant' AND sequence>?2 ORDER BY sequence ASC LIMIT 1",params![p.id,seq],|r|r.get::<_,String>(0)).optional().ok().flatten();
    let assistant_id = answer.clone().unwrap_or_else(new_id);
    let mut conn = db(&app);
    let tx = match conn.transaction() {
        Ok(t) => t,
        Err(_) => return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error"),
    };
    let _ = tx.execute(
        "UPDATE ai_chat_messages SET content=?1 WHERE id=?2 AND profile_id=?3",
        params![message, id, p.id],
    );
    if let Some(existing) = answer {
        let _=tx.execute("UPDATE ai_chat_messages SET content=?1,created_at=datetime('now') WHERE id=?2 AND profile_id=?3",params![content,existing,p.id]);
    } else {
        let next: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(sequence),0)+1 FROM ai_chat_messages WHERE profile_id=?1",
                [&p.id],
                |r| r.get(0),
            )
            .unwrap_or(1);
        let _=tx.execute("INSERT INTO ai_chat_messages(id,profile_id,role,content,sequence) VALUES(?1,?2,'assistant',?3,?4)",params![assistant_id,p.id,content,next]);
    }
    if tx.commit().is_err() {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Internal server error");
    }
    Json(json!({"id":assistant_id,"userMessageId":id,"role":"assistant","content":content}))
        .into_response()
}

#[tokio::main]
async fn main() {
    let production = env::var("NODE_ENV").unwrap_or_default() == "production";
    if production && env::var("COOKIE_SECRET").unwrap_or_default().len() < 32 {
        eprintln!("COOKIE_SECRET must be at least 32 characters in production");
        std::process::exit(1);
    }
    let path = env::var("DATABASE_PATH").unwrap_or_else(|_| "./data/forma-rust-dev.db".into());
    if production && !Path::new(&path).exists() {
        eprintln!("Refusing to create a production database at {path}");
        std::process::exit(1);
    }
    if let Some(parent) = Path::new(&path).parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            eprintln!("Cannot create database directory: {e}");
            std::process::exit(1)
        }
    }
    let conn = match Connection::open(&path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Cannot open SQLite database: {e}");
            std::process::exit(1)
        }
    };
    if let Err(e) = schema_check(&conn) {
        eprintln!("Database compatibility check failed: {e}");
        std::process::exit(1)
    }
    if let Err(e) = conn.pragma_update(None, "foreign_keys", "ON") {
        eprintln!("Cannot enable foreign keys: {e}");
        std::process::exit(1)
    }
    // Existing TypeScript production runs in WAL mode. Preserve that concurrency mode.
    if let Err(e) = conn.pragma_update(None, "journal_mode", "WAL") {
        eprintln!("Cannot enable WAL: {e}");
        std::process::exit(1)
    }
    let app = App {
        db: Arc::new(Mutex::new(conn)),
        production,
    };
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::mirror_request())
        .allow_credentials(true)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(AllowHeaders::mirror_request());
    let router = Router::new()
        .route("/api/health", get(health))
        .route("/api/auth/status", get(auth_status))
        .route("/api/setup/status", get(auth_status))
        .route("/api/auth/check-username", get(username_check))
        .route("/api/auth/setup", post(setup))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
        .route("/api/weight", get(weight_list).post(weight_create))
        .route("/api/weight/stats", get(weight_stats))
        .route("/api/weight/{id}", put(weight_update).delete(weight_delete))
        .route("/api/goals", get(goals_get).post(goals_save))
        .route("/api/goals/active", get(goals_get))
        .route(
            "/api/measurements/definitions",
            get(definitions_get).post(definitions_create),
        )
        .route(
            "/api/measurements/definitions/{id}",
            delete(definitions_delete),
        )
        .route(
            "/api/measurements/entries",
            get(measurement_entries).post(measurement_create),
        )
        .route("/api/measurements/entries/latest", get(measurement_latest))
        .route(
            "/api/measurements/entries/batch",
            post(measurement_create).put(measurement_batch_upsert),
        )
        .route(
            "/api/measurements/entries/{id}",
            put(measurement_update).delete(measurement_delete),
        )
        .route("/api/photos", get(photos_list).post(photos_upload))
        .route("/api/photos/{id}/file", get(photos_file))
        .route("/api/photos/{id}", delete(photos_delete))
        .route("/api/settings", get(settings_get).put(settings_put))
        .route("/api/body-composition", get(body_composition))
        .route("/api/export/json", get(export_json))
        .route("/api/export/csv/weight", get(export_weight_csv))
        .route("/api/export/csv/measurements", get(export_measurement_csv))
        .route("/api/import/json", post(import_json))
        .route(
            "/api/fasting/active",
            get(fasting_active)
                .patch(fasting_patch)
                .delete(fasting_discard_active),
        )
        .route("/api/fasting/start", post(fasting_start))
        .route("/api/fasting/end", post(fasting_end))
        .route("/api/fasting/history", get(fasting_history))
        .route("/api/public/fasting/widget", get(public_fasting_widget))
        .route("/api/fasting/widget-token", get(fasting_token_get))
        .route(
            "/api/fasting/widget-token/regenerate",
            post(fasting_token_regenerate),
        )
        .route("/api/fasting/{id}", delete(fasting_delete))
        .route(
            "/api/nutrition/plan",
            get(nutrition_plan_get).put(nutrition_plan_put),
        )
        .route(
            "/api/nutrition/logs",
            get(nutrition_logs_get).post(nutrition_logs_post),
        )
        .route(
            "/api/ai/settings",
            get(ai_settings_get).put(ai_settings_put),
        )
        .route("/api/ai/settings/key", delete(ai_remove_key))
        .route("/api/ai/models", post(ai_models))
        .route("/api/ai/test", post(ai_test))
        .route(
            "/api/ai/coach-avatar",
            post(ai_coach_avatar_upload).delete(ai_coach_avatar_delete),
        )
        .route("/api/ai/coach-avatar/{filename}", get(ai_coach_avatar_file))
        .route("/api/ai/weekly-report", post(ai_weekly_report))
        .route(
            "/api/ai/chat",
            get(ai_chat_get).post(ai_chat_post).delete(ai_chat_clear),
        )
        .route("/api/ai/chat/memory", get(ai_memory_get).put(ai_memory_put))
        .route("/api/ai/chat/memory/generate", post(ai_memory_generate))
        .route(
            "/api/ai/chat/{id}",
            delete(ai_chat_delete_one).put(ai_chat_edit),
        )
        .route("/api/ai/weekly-reports", get(ai_reports_get))
        .route("/api/ai/weekly-reports/{id}", delete(ai_report_delete))
        .route("/api/profile", get(profile_get).put(profile_update))
        .route(
            "/api/profile/avatar",
            post(avatar_upload).delete(avatar_delete),
        )
        .route("/api/profile/avatar/{filename}", get(avatar_file))
        .route("/api/public/profile/{username}", get(public_profile))
        .route(
            "/api/admin/settings",
            get(admin_settings_get).put(admin_settings_put),
        )
        .route("/api/admin/users", get(admin_users))
        .route("/api/admin/users/{id}/role", put(admin_user_role))
        .route("/api/admin/users/{id}", delete(admin_user_delete))
        .fallback(fallback)
        .layer(middleware::from_fn(authenticate))
        .layer(cors)
        .with_state(app);
    let port = env::var("PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3001);
    let listener = tokio::net::TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port)))
        .await
        .expect("bind server");
    eprintln!("Forma Rust API listening on {port}; database={path}; schema unchanged");
    axum::serve(listener, router).await.expect("serve API");
}
