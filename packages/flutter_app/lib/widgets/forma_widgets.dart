import 'package:flutter/material.dart';

class PageHeading extends StatelessWidget {
  const PageHeading(this.title, {this.subtitle, this.trailing, super.key});
  final String title;
  final String? subtitle;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: LayoutBuilder(builder: (context, constraints) {
          final titleBlock =
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title,
                style: Theme.of(context)
                    .textTheme
                    .headlineMedium
                    ?.copyWith(fontWeight: FontWeight.w600),
                maxLines: 2,
                overflow: TextOverflow.ellipsis),
            if (subtitle != null) ...[
              const SizedBox(height: 5),
              Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium),
            ],
          ]);
          if (trailing == null) return titleBlock;
          if (constraints.maxWidth < 600) {
            return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [titleBlock, const SizedBox(height: 12), trailing!]);
          }
          return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: titleBlock),
            const SizedBox(width: 16),
            trailing!,
          ]);
        }),
      );
}

class SectionCard extends StatelessWidget {
  const SectionCard(
      {required this.child,
      this.padding = const EdgeInsets.all(18),
      super.key});
  final Widget child;
  final EdgeInsetsGeometry padding;
  @override
  Widget build(BuildContext context) =>
      Card(child: Padding(padding: padding, child: child));
}

class MetricTile extends StatelessWidget {
  const MetricTile(
      {required this.label,
      required this.value,
      this.detail,
      this.icon,
      super.key});
  final String label, value;
  final String? detail;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => SectionCard(
      padding: const EdgeInsets.all(14),
      child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              if (icon != null) ...[
                Icon(icon,
                    size: 17, color: Theme.of(context).colorScheme.primary),
                const SizedBox(width: 7)
              ],
              Expanded(
                  child: Text(label,
                      style: Theme.of(context).textTheme.labelLarge))
            ]),
            const SizedBox(height: 8),
            FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text(value,
                    style: Theme.of(context)
                        .textTheme
                        .titleLarge
                        ?.copyWith(fontWeight: FontWeight.w600))),
            if (detail != null) ...[
              const SizedBox(height: 3),
              Text(detail!,
                  style: Theme.of(context).textTheme.bodySmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis)
            ],
          ]));
}

class AsyncContent<T> extends StatelessWidget {
  const AsyncContent(
      {required this.future, required this.builder, this.onRetry, super.key});
  final Future<T> future;
  final Widget Function(BuildContext, T) builder;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) => FutureBuilder<T>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(
              child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.cloud_off_outlined, size: 36),
                    const SizedBox(height: 10),
                    Text(snapshot.error.toString(),
                        textAlign: TextAlign.center),
                    if (onRetry != null)
                      TextButton(
                          onPressed: onRetry, child: const Text('Try again')),
                  ])));
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        return builder(context, snapshot.data as T);
      });
}

Future<void> showFormaError(BuildContext context, Object error) async {
  if (!context.mounted) return;
  final text =
      error.toString().replaceFirst('DioException [bad response]:', '').trim();
  await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
            title: const Text('Could not save changes'),
            content: SelectableText(text),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Close'))
            ],
          ));
}

Future<String?> askText(BuildContext context, String title,
    {String initial = '', String label = 'Value', String? hint}) async {
  final controller = TextEditingController(text: initial);
  return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
            title: Text(title),
            content: TextField(
                controller: controller,
                autofocus: true,
                decoration: InputDecoration(labelText: label, hintText: hint)),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Cancel')),
              FilledButton(
                  onPressed: () =>
                      Navigator.pop(context, controller.text.trim()),
                  child: const Text('Save'))
            ],
          ));
}

Future<bool> confirmAction(
        BuildContext context, String title, String message) async =>
    await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
              title: Text(title),
              content: Text(message),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('Cancel')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('Continue')),
              ],
            )) ??
    false;
