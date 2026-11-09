import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:forma/theme/forma_theme.dart';
import 'package:forma/widgets/forma_widgets.dart';

void main() {
  testWidgets('Forma metric tile renders its label and value', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: FormaTheme.light,
      home: const Scaffold(
          body: MetricTile(label: 'Current weight', value: '72.4 kg')),
    ));

    expect(find.text('Current weight'), findsOneWidget);
    expect(find.text('72.4 kg'), findsOneWidget);
  });

  test('Forma provides distinct light and dark theme brightness', () {
    expect(FormaTheme.light.brightness, Brightness.light);
    expect(FormaTheme.dark.brightness, Brightness.dark);
    expect(FormaTheme.light.scaffoldBackgroundColor,
        isNot(FormaTheme.dark.scaffoldBackgroundColor));
  });
}
