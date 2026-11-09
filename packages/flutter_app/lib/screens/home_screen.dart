import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../data/api_client.dart';
import '../state/session_state.dart';
import '../widgets/forma_widgets.dart';
import 'feature_screens.dart' show WeightLineChart, asJson, asList, numVal, str;

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<List<dynamic>> data;
  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => data = Future.wait<dynamic>([
        widget.api.getMap('/weight/stats'),
        widget.api.getList('/weight?limit=90'),
        widget.api.getMap('/body-composition'),
        widget.api.getMap('/goals'),
        widget.api.getMap('/nutrition/plan'),
        widget.api.getMap('/fasting/active'),
      ]);
  @override
  Widget build(BuildContext context) => AsyncContent<List<dynamic>>(
      future: data,
      onRetry: () => setState(_load),
      builder: (context, d) {
        final stats = asJson(d[0]),
            weights = asList(d[1]),
            comp = asJson(d[2]),
            goal = asJson(d[3]),
            nutrition = asJson(d[4]),
            fasting = asJson(d[5]);
        final current = asJson(stats['currentWeight']),
            bmi = asJson(comp['bmi']),
            fat = asJson(comp['bodyFat']),
            plan = asJson(nutrition['plan']),
            calculated = asJson(nutrition['calculated']);
        final who = context.watch<SessionState>().user;
        final name = who?['displayName']?.toString() ??
            who?['username']?.toString() ??
            'there';
        final active = asJson(fasting['activeFast']);
        final wide = MediaQuery.sizeOf(context).width >= 950;
        final metricCards = <Widget>[
          MetricTile(
              label: 'Current weight',
              value: current.isEmpty
                  ? '—'
                  : '${numVal(current['value']).toStringAsFixed(1)} kg',
              detail: stats['totalChange'] == null
                  ? 'Log your first entry'
                  : '${numVal(stats['totalChange']).toStringAsFixed(1)} kg overall',
              icon: Icons.monitor_weight_outlined),
          MetricTile(
              label: 'BMI',
              value:
                  bmi.isEmpty ? '—' : numVal(bmi['value']).toStringAsFixed(1),
              detail: str(bmi['category'], 'Add height and weight'),
              icon: Icons.accessibility_new),
          MetricTile(
              label: 'Body fat estimate',
              value: fat['preferredValue'] == null
                  ? '—'
                  : '${numVal(fat['preferredValue']).toStringAsFixed(1)}%',
              detail: str(fat['category'], 'Add measurements'),
              icon: Icons.pie_chart_outline),
          MetricTile(
              label: 'Target weight',
              value: str(
                  goal['target_weight'] ?? goal['targetWeight'], 'Set a goal'),
              detail:
                  goal['target_date'] ?? goal['targetDate'] ?? 'Goal progress',
              icon: Icons.flag_outlined),
        ];
        return LayoutBuilder(
            builder: (context, box) => ListView(
                    padding: EdgeInsets.fromLTRB(
                        wide ? 34 : 18, 22, wide ? 34 : 18, 28),
                    children: [
                      PageHeading('Good progress, $name.',
                          subtitle:
                              'Your health picture, updated from your Forma records.',
                          trailing: IconButton(
                              tooltip: 'Refresh',
                              onPressed: () => setState(_load),
                              icon: const Icon(Icons.refresh))),
                      GridView.count(
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          crossAxisCount: wide ? 4 : 2,
                          childAspectRatio: wide ? 1.3 : 1.35,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          children: metricCards),
                      const SizedBox(height: 14),
                      if (active.isNotEmpty)
                        Card(
                            color:
                                Theme.of(context).colorScheme.primaryContainer,
                            child: ListTile(
                                leading: const Icon(Icons.bolt),
                                title: const Text('Fasting timer is running'),
                                subtitle: Text(
                                    'Started ${active['started_at']} · ${active['target_duration_hours']} hour target'),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () => context.go('/fasting'))),
                      if (active.isNotEmpty) const SizedBox(height: 14),
                      LayoutBuilder(
                          builder: (context, b) =>
                              Wrap(spacing: 14, runSpacing: 14, children: [
                                SizedBox(
                                    width: wide
                                        ? (b.maxWidth - 14) * .62
                                        : b.maxWidth,
                                    child: SectionCard(
                                        child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                          Row(children: [
                                            Expanded(
                                                child: Text('Weight trend',
                                                    style: Theme.of(context)
                                                        .textTheme
                                                        .titleLarge)),
                                            Text('${weights.length} entries',
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .labelMedium)
                                          ]),
                                          const SizedBox(height: 18),
                                          SizedBox(
                                              height: 240,
                                              child: WeightLineChart(
                                                  entries: weights.reversed
                                                      .toList())),
                                          const SizedBox(height: 8),
                                          Align(
                                              alignment: Alignment.centerRight,
                                              child: TextButton.icon(
                                                  onPressed: () =>
                                                      context.go('/weight'),
                                                  icon: const Icon(
                                                      Icons.arrow_forward),
                                                  label: const Text(
                                                      'View weight history')))
                                        ]))),
                                SizedBox(
                                    width: wide
                                        ? (b.maxWidth - 14) * .38
                                        : b.maxWidth,
                                    child: SectionCard(
                                        child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                          Text('Today’s nutrition plan',
                                              style: Theme.of(context)
                                                  .textTheme
                                                  .titleLarge),
                                          const SizedBox(height: 10),
                                          _MacroLine(
                                              name: 'Energy',
                                              value:
                                                  '${numVal(plan['daily_calories'] ?? calculated['dailyCalories']).round()} kcal',
                                              ratio: 1),
                                          _MacroLine(
                                              name: 'Protein',
                                              value:
                                                  '${numVal(plan['protein_grams'] ?? calculated['proteinGrams']).round()} g',
                                              ratio: .8),
                                          _MacroLine(
                                              name: 'Carbs',
                                              value:
                                                  '${numVal(plan['carbs_grams'] ?? calculated['carbsGrams']).round()} g',
                                              ratio: .5),
                                          _MacroLine(
                                              name: 'Fat',
                                              value:
                                                  '${numVal(plan['fat_grams'] ?? calculated['fatGrams']).round()} g',
                                              ratio: .65),
                                          const SizedBox(height: 4),
                                          Align(
                                              alignment: Alignment.centerRight,
                                              child: TextButton(
                                                  onPressed: () =>
                                                      context.go('/nutrition'),
                                                  child: const Text(
                                                      'Nutrition details')))
                                        ]))),
                              ])),
                      const SizedBox(height: 14),
                      Wrap(spacing: 10, runSpacing: 10, children: [
                        _QuickAction('Log weight', Icons.add,
                            () => context.go('/weight')),
                        _QuickAction('Measurements', Icons.straighten,
                            () => context.go('/measurements')),
                        _QuickAction(
                            'Progress photos',
                            Icons.photo_camera_outlined,
                            () => context.go('/photos')),
                        _QuickAction('Set a goal', Icons.flag_outlined,
                            () => context.go('/goals'))
                      ]),
                    ]));
      });
}

class _MacroLine extends StatelessWidget {
  const _MacroLine(
      {required this.name, required this.value, required this.ratio});
  final String name, value;
  final double ratio;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(children: [
        Expanded(child: Text(name)),
        Text(value, style: Theme.of(context).textTheme.labelLarge)
      ]));
}

class _QuickAction extends StatelessWidget {
  const _QuickAction(this.label, this.icon, this.onTap);
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => ActionChip(
      avatar: Icon(icon, size: 18), label: Text(label), onPressed: onTap);
}
