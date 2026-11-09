import 'dart:io';

import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:path_provider/path_provider.dart';

Future<void> configure(Dio dio) async {
  final support = await getApplicationSupportDirectory();
  final cookieDirectory = Directory('${support.path}/forma-cookies');
  await cookieDirectory.create(recursive: true);
  dio.interceptors.add(CookieManager(PersistCookieJar(
    storage: FileStorage(cookieDirectory.path),
  )));
}
