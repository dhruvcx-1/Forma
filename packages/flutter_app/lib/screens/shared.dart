import 'package:flutter/material.dart';

typedef Json = Map<String, dynamic>;
Json asJson(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};
List<dynamic> asList(dynamic value) => value is List ? value : const [];
String str(dynamic value, [String fallback = '—']) =>
    value == null || value.toString().isEmpty ? fallback : value.toString();
double numVal(dynamic value, [double fallback = 0]) =>
    value is num ? value.toDouble() : double.tryParse('$value') ?? fallback;
String today() => DateTime.now().toIso8601String().substring(0, 10);
String displayDate(dynamic value) => value == null
    ? '—'
    : value.toString().replaceFirst('T', ' ').split('.').first;

Future<void> snack(BuildContext context, String message) async {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), behavior: SnackBarBehavior.floating));
}

Widget emptyMessage(BuildContext context, String title, String detail) =>
    Padding(
      padding: const EdgeInsets.symmetric(vertical: 36, horizontal: 18),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.auto_graph_outlined,
            size: 34, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 10),
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(detail,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall),
      ]),
    );
