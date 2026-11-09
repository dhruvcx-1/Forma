import 'package:flutter/material.dart';

abstract final class FormaTheme {
  static const ink = Color(0xff17221e);
  static const green = Color(0xff367a5d);
  static const canvas = Color(0xfff5f6f2);

  static ThemeData get light => _make(Brightness.light, canvas, ink, green,
      const Color(0xffffffff), const Color(0xff737d75));
  static ThemeData get dark => _make(
      Brightness.dark,
      const Color(0xff141916),
      const Color(0xffeef3ee),
      const Color(0xff8bc8a8),
      const Color(0xff202923),
      const Color(0xffa2aea5));

  static ThemeData _make(Brightness brightness, Color bg, Color fg,
      Color accent, Color surface, Color muted) {
    final scheme = ColorScheme.fromSeed(
        seedColor: accent,
        brightness: brightness,
        surface: surface,
        primary: accent,
        onSurface: fg);
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      textTheme: ThemeData(brightness: brightness)
          .textTheme
          .apply(bodyColor: fg, displayColor: fg, fontFamily: 'Roboto'),
      appBarTheme: AppBarTheme(
          backgroundColor: bg,
          foregroundColor: fg,
          surfaceTintColor: Colors.transparent,
          elevation: 0),
      cardTheme: CardThemeData(
          color: surface,
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
              side: BorderSide(color: muted.withValues(alpha: .16)))),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide.none),
      ),
    );
  }
}
