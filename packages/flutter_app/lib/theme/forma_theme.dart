import 'package:flutter/material.dart';

abstract final class FormaTheme {
  static const ink = Color(0xff17221e);
  static const violet = Color(0xff8b3dff);
  static const canvas = Color(0xfff5f6f2);

  static ThemeData lightFor(Color accent, {Color? systemAccent}) => _make(
      Brightness.light,
      canvas,
      ink,
      accent,
      const Color(0xffffffff),
      const Color(0xff737d75),
      systemAccent);
  static ThemeData darkFor(Color accent, {Color? systemAccent}) => _make(
      Brightness.dark,
      const Color(0xff0b0c0f),
      const Color(0xffeff0f5),
      accent,
      const Color(0xff141519),
      const Color(0xff92939e),
      systemAccent);
  static ThemeData get light => lightFor(violet);
  static ThemeData get dark => darkFor(const Color(0xffa46bff));

  static ThemeData _make(Brightness brightness, Color bg, Color fg,
      Color accent, Color surface, Color muted,
      [Color? systemAccent]) {
    final scheme = systemAccent == null
        ? ColorScheme.fromSeed(
            seedColor: accent,
            brightness: brightness,
            surface: surface,
            primary: accent,
            onSurface: fg)
        : ColorScheme.fromSeed(
            seedColor: systemAccent,
            brightness: brightness,
            primary: systemAccent);
    final themedBg = systemAccent == null ? bg : scheme.surface;
    final themedSurface =
        systemAccent == null ? surface : scheme.surfaceContainerLow;
    final themedFg = systemAccent == null ? fg : scheme.onSurface;
    final themedMuted = systemAccent == null ? muted : scheme.outlineVariant;
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: themedBg,
      textTheme: ThemeData(brightness: brightness).textTheme.apply(
          bodyColor: themedFg, displayColor: themedFg, fontFamily: 'Roboto'),
      appBarTheme: AppBarTheme(
          backgroundColor: themedBg,
          foregroundColor: themedFg,
          surfaceTintColor: Colors.transparent,
          elevation: 0),
      cardTheme: CardThemeData(
          color: themedSurface,
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(18),
              side: BorderSide(color: themedMuted.withValues(alpha: .35)))),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: themedSurface,
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide.none),
      ),
    );
  }
}
