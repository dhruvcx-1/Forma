import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ThemeState extends ChangeNotifier {
  ThemeMode mode = ThemeMode.system;
  String accent = 'violet';
  static const accents = <String, Color>{
    'violet': Color(0xff8b3dff),
    'blue': Color(0xff3478f6),
    'teal': Color(0xff008f83),
    'rose': Color(0xffdb4777),
    'amber': Color(0xffc27a00),
  };
  Color get accentColor => accents[accent] ?? accents['violet']!;
  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    accent = accents.containsKey(prefs.getString('theme_accent'))
        ? prefs.getString('theme_accent')!
        : 'violet';
    mode = switch (prefs.getString('theme_mode')) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
    notifyListeners();
  }

  Future<void> setAccent(String next) async {
    if (!accents.containsKey(next)) return;
    accent = next;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('theme_accent', next);
  }

  Future<void> setMode(ThemeMode next) async {
    mode = next;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        'theme_mode',
        switch (next) {
          ThemeMode.light => 'light',
          ThemeMode.dark => 'dark',
          _ => 'system',
        });
  }
}
