import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'platform_adapter_stub.dart'
    if (dart.library.html) 'platform_adapter_web.dart'
    if (dart.library.io) 'platform_adapter_native.dart' as platform_adapter;

class ApiClient {
  ApiClient._(this.dio);
  final Dio dio;

  static Future<ApiClient> create({String? baseUrl}) async {
    const configured = String.fromEnvironment('FORMA_API_BASE_URL');
    final selectedBaseUrl = configured.isNotEmpty
        ? configured
        : (baseUrl ?? (kIsWeb ? Uri.base.origin : 'http://10.0.2.2:3001'));
    final normalized = selectedBaseUrl.trim().replaceFirst(RegExp(r'/+$'), '');
    final dio = Dio(BaseOptions(
      baseUrl: normalized.endsWith('/api') ? normalized : '$normalized/api',
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 20),
      headers: {'Accept': 'application/json'},
    ));
    await platform_adapter.configure(dio);
    return ApiClient._(dio);
  }

  Future<Map<String, dynamic>> getMap(String path) async {
    final result = (await dio.get(path)).data;
    return result == null
        ? <String, dynamic>{}
        : Map<String, dynamic>.from(result as Map);
  }

  Future<List<dynamic>> getList(String path) async =>
      List<dynamic>.from((await dio.get(path)).data as List);

  Future<Map<String, dynamic>> post(
          String path, Map<String, dynamic> body) async =>
      Map<String, dynamic>.from((await dio.post(path, data: body)).data as Map);

  Future<Map<String, dynamic>> put(
          String path, Map<String, dynamic> body) async =>
      Map<String, dynamic>.from((await dio.put(path, data: body)).data as Map);

  Future<Map<String, dynamic>> patch(
          String path, Map<String, dynamic> body) async =>
      Map<String, dynamic>.from(
          (await dio.patch(path, data: body)).data as Map);

  Future<dynamic> delete(String path) async => (await dio.delete(path)).data;

  Future<dynamic> postDynamic(String path, [Object? body]) async =>
      (await dio.post(path, data: body)).data;

  Future<List<int>> getBytes(String path) async =>
      List<int>.from((await dio.get<List<int>>(path,
                  options: Options(responseType: ResponseType.bytes)))
              .data ??
          const []);

  Future<List<dynamic>> getDynamicList(String path) async =>
      List<dynamic>.from((await dio.get(path)).data as List);
}
