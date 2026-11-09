import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'data/api_client.dart';
import 'state/session_state.dart';
import 'state/theme_state.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = await ApiClient.create();
  runApp(MultiProvider(providers: [
    ChangeNotifierProvider(create: (_) => SessionState(api)..restore()),
    ChangeNotifierProvider(create: (_) => ThemeState()..restore()),
  ], child: FormaApp(api: api)));
}
