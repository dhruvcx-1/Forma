import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import '../data/api_client.dart';

class SessionState extends ChangeNotifier {
  SessionState(this.api);
  final ApiClient api;
  Map<String, dynamic>? user;
  Map<String, dynamic>? status;
  bool busy = true;
  bool isRestoring = true;
  String? error;

  Future<void> restore() async {
    final startedAt = DateTime.now();
    try {
      status = await api.getMap('/auth/status');
      if (status?['isAuthenticated'] == true) {
        final me = await api.getMap('/auth/me');
        user = Map<String, dynamic>.from(me['user'] as Map);
      }
    } catch (_) {
      error = 'Could not reach Forma. Check the server address and try again.';
    } finally {
      // Keep the branded startup screen visible long enough to prevent a flash
      // between the first Flutter frame and the resolved login/app route.
      final elapsed = DateTime.now().difference(startedAt);
      const minimumSplashTime = Duration(milliseconds: 500);
      if (elapsed < minimumSplashTime) {
        await Future<void>.delayed(minimumSplashTime - elapsed);
      }
      isRestoring = false;
      busy = false;
      notifyListeners();
    }
  }

  Future<bool> signIn(String username, String password,
      {bool setup = false, bool register = false, String? displayName}) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      await api.post(
          setup
              ? '/auth/setup'
              : register
                  ? '/auth/register'
                  : '/auth/login',
          {
            'username': username.trim(),
            'password': password,
            if (displayName?.trim().isNotEmpty == true)
              'displayName': displayName!.trim(),
          });
      final me = await api.getMap('/auth/me');
      user = Map<String, dynamic>.from(me['user'] as Map);
      status = await api.getMap('/auth/status');
      return true;
    } catch (e) {
      error = e is Exception ? _message(e) : 'Sign in failed. Try again.';
      return false;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> signOut() async {
    await api.dio.post('/auth/logout');
    user = null;
    notifyListeners();
  }

  String _message(Object error) {
    if (error is DioException && error.response?.data is Map) {
      return (error.response!.data['error'] as String?) ?? 'Request failed.';
    }
    return 'Could not connect to Forma. Check your server address.';
  }
}
