import 'package:flutter/material.dart';

abstract final class FormaTheme {
  static const ink = Color(0xff17221e);
  static const violet = Color(0xff8b3dff);
  static const canvas = Color(0xfff5f6f2);

  static ThemeData get light => _make(Brightness.light, canvas, ink, violet,
      const Color(0xffffffff), const Color(0xff737d75));
  static ThemeData get dark => _make(
      Brightness.dark,
      const Color(0xff0b0c0f),
      const Color(0xffeff0f5),
      const Color(0xffa46bff),
      const Color(0xff141519),
      const Color(0xff92939e));

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
