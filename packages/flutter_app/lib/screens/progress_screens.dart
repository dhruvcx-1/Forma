import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/api_client.dart';
import '../widgets/forma_widgets.dart';
import 'shared.dart';

class GoalsScreen extends StatefulWidget {
  const GoalsScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<GoalsScreen> createState() => _GoalsScreenState();
}

class _GoalsScreenState extends State<GoalsScreen> {
  late Future<(Json, Json)> _data;
  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => _data = Future.wait<dynamic>(
          [widget.api.getMap('/goals'), widget.api.getMap('/weight/stats')])
      .then((v) => (asJson(v[0]), asJson(v[1])));
  Future<void> _edit(Json goal) async {
    final start = TextEditingController(
        text: str(goal['starting_weight'] ?? goal['startWeight'], ''));
    final target = TextEditingController(
        text: str(goal['target_weight'] ?? goal['targetWeight'], ''));
    final date = TextEditingController(
        text: str(goal['target_date'] ?? goal['targetDate'], ''));
    final notes = TextEditingController(text: str(goal['notes'], ''));
    final unit =
        TextEditingController(text: str(goal['target_weight_unit'], 'kg'));
    final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Set your target'),
                content: SizedBox(
                    width: 420,
                    child: SingleChildScrollView(
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                      TextField(
                          controller: start,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                              labelText: 'Starting weight')),
                      const SizedBox(height: 10),
                      TextField(
                          controller: target,
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                              labelText: 'Target weight')),
                      const SizedBox(height: 10),
                      TextField(
                          controller: unit,
                          decoration: const InputDecoration(
                              labelText: 'Weight unit (kg or lbs)')),
                      const SizedBox(height: 10),
                      TextField(
                          controller: date,
                          decoration: const InputDecoration(
                              labelText: 'Target date (YYYY-MM-DD)')),
                      const SizedBox(height: 10),
                      TextField(
                          controller: notes,
                          decoration: const InputDecoration(labelText: 'Notes'))
                    ]))),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('Save goal'))
                ]));
    if (ok != true) return;
    try {
      await widget.api.post('/goals', {
        'starting_weight': numVal(start.text) > 0 ? numVal(start.text) : null,
        'target_weight': numVal(target.text) > 0 ? numVal(target.text) : null,
        'target_weight_unit': unit.text.trim() == 'lbs' ? 'lbs' : 'kg',
        'target_date': date.text.trim().isEmpty ? null : date.text.trim(),
        'notes': notes.text
      });
      if (!mounted) return;
      setState(_load);
    } catch (e) {
      if (!mounted) return;
      await showFormaError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) => AsyncContent<(Json, Json)>(
      future: _data,
      onRetry: () => setState(_load),
      builder: (context, d) {
        final goal = d.$1, stats = d.$2;
        final current = asJson(stats['currentWeight']);
        final target =
            numVal(goal['target_weight'] ?? goal['targetWeight'], -1);
        final weight = numVal(current['value'], -1);
        final start =
            numVal(goal['starting_weight'] ?? goal['startWeight'], -1);
        final unit =
            str(goal['target_weight_unit'], str(current['unit'], 'kg'));
        final range = target - start;
        final progress = target > 0 && start > 0 && weight > 0
            ? range.abs() < .001
                ? 1.0
                : ((weight - start) / range).clamp(0.0, 1.0).toDouble()
            : 0.0;
        final days = DateTime.tryParse(
                str(goal['target_date'] ?? goal['targetDate'], ''))
            ?.difference(DateTime.now())
            .inDays;
        final daysText = days == null
            ? 'No target date'
            : days < 0
                ? 'Target date passed'
                : days == 0
                    ? 'Target date is today'
                    : '$days days remaining';
        final remaining =
            target > 0 && weight > 0 ? (target - weight).abs() : 0;
        final weeklyPace = target > 0 && weight > 0 && days != null && days > 0
            ? (target - weight) / days * 7
            : null;
        return ListView(
            padding: const EdgeInsets.fromLTRB(18, 20, 18, 30),
            children: [
              PageHeading('Goals',
                  subtitle:
                      'A clear target, with progress grounded in your records.'),
              SectionCard(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Container(
                              width: 38,
                              height: 38,
                              decoration: BoxDecoration(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .primaryContainer,
                                  borderRadius: BorderRadius.circular(13)),
                              child: Icon(Icons.flag_outlined,
                                  color:
                                      Theme.of(context).colorScheme.primary)),
                          const SizedBox(width: 11),
                          Expanded(
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                Text(
                                    target > 0
                                        ? 'Weight target'
                                        : 'Set your first goal',
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium
                                        ?.copyWith(
                                            fontWeight: FontWeight.w700)),
                                Text(
                                    target > 0
                                        ? 'Your progress at a glance'
                                        : 'Choose a target and timeline',
                                    style:
                                        Theme.of(context).textTheme.bodySmall),
                              ])),
                          IconButton.filledTonal(
                              tooltip: 'Edit goal',
                              onPressed: () => _edit(goal),
                              icon: const Icon(Icons.edit_outlined))
                        ]),
                        const SizedBox(height: 20),
                        if (target > 0) ...[
                          LayoutBuilder(builder: (context, box) {
                            final stacked = box.maxWidth < 350;
                            final targetWidget = Text(
                                '${target.toStringAsFixed(1)} $unit',
                                style: Theme.of(context)
                                    .textTheme
                                    .displaySmall
                                    ?.copyWith(
                                        fontWeight: FontWeight.w800,
                                        letterSpacing: -1.2));
                            final progressBadge = Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 11, vertical: 7),
                                decoration: BoxDecoration(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .primaryContainer,
                                    borderRadius: BorderRadius.circular(99)),
                                child: Text(
                                    '${(progress * 100).round()}% complete',
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelMedium
                                        ?.copyWith(
                                            color: Theme.of(context)
                                                .colorScheme
                                                .primary,
                                            fontWeight: FontWeight.w700)));
                            return stacked
                                ? Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                        targetWidget,
                                        const SizedBox(height: 8),
                                        progressBadge,
                                      ])
                                : Row(children: [
                                    Expanded(child: targetWidget),
                                    progressBadge,
                                  ]);
                          }),
                          const SizedBox(height: 16),
                          ClipRRect(
                              borderRadius: BorderRadius.circular(99),
                              child: LinearProgressIndicator(
                                  value: progress, minHeight: 11)),
                          const SizedBox(height: 9),
                          Row(children: [
                            Expanded(
                                child: Text(
                                    'Start ${start > 0 ? '${start.toStringAsFixed(1)} $unit' : '—'}',
                                    style:
                                        Theme.of(context).textTheme.bodySmall)),
                            Text('Target ${target.toStringAsFixed(1)} $unit',
                                style: Theme.of(context).textTheme.bodySmall),
                          ]),
                          const SizedBox(height: 16),
                          Wrap(spacing: 8, runSpacing: 8, children: [
                            _InfoChip(
                                icon: Icons.monitor_weight_outlined,
                                label:
                                    'Current ${weight > 0 ? '${weight.toStringAsFixed(1)} $unit' : '—'}'),
                            _InfoChip(
                                icon: Icons.calendar_today_outlined,
                                label: daysText),
                          ]),
                          if (str(goal['notes'], '').isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Text(str(goal['notes'], ''),
                                style: Theme.of(context).textTheme.bodyMedium),
                          ]
                        ] else ...[
                          Text(
                              'Start with one simple target. You can adjust it whenever your priorities change.',
                              style: Theme.of(context).textTheme.bodyMedium),
                          const SizedBox(height: 16),
                          FilledButton.icon(
                              onPressed: () => _edit(goal),
                              icon: const Icon(Icons.add),
                              label: const Text('Create a goal'))
                        ]
                      ])),
              if (target > 0) ...[
                const SizedBox(height: 14),
                MetricGrid(children: [
                  MetricTile(
                      label: 'Current weight',
                      value: weight > 0
                          ? '${weight.toStringAsFixed(1)} $unit'
                          : '—',
                      detail: 'Latest recorded',
                      icon: Icons.monitor_weight_outlined),
                  MetricTile(
                      label: 'To your target',
                      value: weight > 0
                          ? '${remaining.toStringAsFixed(1)} $unit'
                          : '—',
                      detail: target >= weight
                          ? 'Left to lose or gain'
                          : 'Past your target',
                      icon: Icons.straighten_outlined),
                  MetricTile(
                      label: 'Weekly pace',
                      value: weeklyPace == null
                          ? '—'
                          : '${weeklyPace > 0 ? '+' : ''}${weeklyPace.toStringAsFixed(2)} $unit',
                      detail: weeklyPace == null
                          ? 'Add a target date to estimate'
                          : 'Per week to meet date',
                      icon: Icons.trending_up_outlined),
                ]),
              ],
              const SizedBox(height: 14),
              SectionCard(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Row(children: [
                      Expanded(
                          child: Text('Milestones',
                              style: Theme.of(context).textTheme.titleLarge)),
                      if (target > 0 && start > 0)
                        Text('${(progress * 100).round()}% complete',
                            style: Theme.of(context)
                                .textTheme
                                .labelMedium
                                ?.copyWith(
                                    color:
                                        Theme.of(context).colorScheme.primary,
                                    fontWeight: FontWeight.w700)),
                    ]),
                    const SizedBox(height: 12),
                    if (target > 0 && start > 0)
                      LayoutBuilder(builder: (context, box) {
                        const gap = 10.0;
                        final columns = box.maxWidth < 360 ? 2 : 4;
                        final width =
                            (box.maxWidth - (columns - 1) * gap) / columns;
                        return Wrap(spacing: gap, runSpacing: gap, children: [
                          for (final p in [.25, .5, .75, 1.0])
                            SizedBox(
                                width: width,
                                child: _MilestoneTile(
                                    percent: p,
                                    value: start + (target - start) * p,
                                    unit: unit,
                                    completed: progress >= p)),
                        ]);
                      })
                    else
                      Text(
                          'Add starting and target weights to see your milestones.',
                          style: Theme.of(context).textTheme.bodyMedium),
                  ])),
            ]);
      });
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});
  final IconData icon;
  final String label;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
        decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(99)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 15, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 6),
          Text(label, style: Theme.of(context).textTheme.labelMedium),
        ]),
      );
}

class _MilestoneTile extends StatelessWidget {
  const _MilestoneTile({
    required this.percent,
    required this.value,
    required this.unit,
    required this.completed,
  });
  final double percent, value;
  final String unit;
  final bool completed;
  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: completed
              ? color.primaryContainer.withValues(alpha: .42)
              : color.surfaceContainerHighest.withValues(alpha: .55),
          borderRadius: BorderRadius.circular(14),
          border:
              Border.all(color: color.outlineVariant.withValues(alpha: .45))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(completed ? Icons.check_circle : Icons.circle_outlined,
            size: 18,
            color: completed ? color.primary : color.onSurfaceVariant),
        const SizedBox(height: 8),
        Text('${(percent * 100).round()}%',
            style: Theme.of(context)
                .textTheme
                .titleMedium
                ?.copyWith(fontWeight: FontWeight.w700)),
        Text('${value.toStringAsFixed(1)} $unit',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall),
      ]),
    );
  }
}

class NutritionScreen extends StatefulWidget {
  const NutritionScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<NutritionScreen> createState() => _NutritionScreenState();
}

class _NutritionScreenState extends State<NutritionScreen> {
  late Future<(Json, Json)> _data;
  final fields = <String, TextEditingController>{};
  final customFields = <String, TextEditingController>{};
  String diet = 'high_protein_low_carb', activity = 'moderate';
  bool _selectionInitialized = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => _data = Future.wait<dynamic>([
        widget.api.getMap('/nutrition/plan'),
        widget.api.getMap('/nutrition/logs?date=${today()}')
      ]).then((v) {
        final result = asJson(v[0]);
        final saved = asJson(result['plan']);
        final calc = asJson(result['calculated']);
        if (!_selectionInitialized) {
          diet = str(
              saved['diet_type'] ?? calc['dietType'], 'high_protein_low_carb');
          activity =
              str(saved['activity_level'] ?? calc['activityLevel'], 'moderate');
          if (diet == 'custom') {
            for (final key in [
              'daily_calories',
              'protein_grams',
              'carbs_grams',
              'fat_grams'
            ]) {
              customFields[key] =
                  TextEditingController(text: str(saved[key], ''));
            }
          }
          _selectionInitialized = true;
        }
        return (result, asJson(v[1]));
      });

  void _previewPlan() {
    final path =
        '/nutrition/plan?diet_type=${Uri.encodeQueryComponent(diet)}&activity_level=${Uri.encodeQueryComponent(activity)}';
    setState(() => _data = Future.wait<dynamic>([
          widget.api.getMap(path),
          widget.api.getMap('/nutrition/logs?date=${today()}')
        ]).then((v) => (asJson(v[0]), asJson(v[1]))));
  }

  TextEditingController _field(String key, dynamic initial) {
    return fields.putIfAbsent(
        key, () => TextEditingController(text: initial?.toString() ?? ''));
  }

  TextEditingController _customField(String key, dynamic initial) =>
      customFields.putIfAbsent(
          key, () => TextEditingController(text: initial?.toString() ?? ''));

  Future<void> _saveLog() async {
    try {
      await widget.api.post('/nutrition/logs', {
        'date': today(),
        'calories': numVal(fields['calories']?.text),
        'protein_grams': numVal(fields['protein_grams']?.text),
        'carbs_grams': numVal(fields['carbs_grams']?.text),
        'fat_grams': numVal(fields['fat_grams']?.text),
        'notes': fields['notes']?.text ?? ''
      });
      if (!mounted) return;
      setState(_load);
      await snack(context, 'Today’s intake saved');
    } catch (e) {
      if (!mounted) return;
      await showFormaError(context, e);
    }
  }

  Future<void> _savePlan(Json calc) async {
    try {
      await widget.api.put('/nutrition/plan', {
        'diet_type': diet,
        'activity_level': activity,
        'daily_calories': diet == 'custom'
            ? numVal(customFields['daily_calories']?.text,
                numVal(calc['dailyCalories']))
            : numVal(calc['dailyCalories']),
        'protein_grams': diet == 'custom'
            ? numVal(customFields['protein_grams']?.text,
                numVal(calc['proteinGrams']))
            : numVal(calc['proteinGrams']),
        'carbs_grams': diet == 'custom'
            ? numVal(
                customFields['carbs_grams']?.text, numVal(calc['carbsGrams']))
            : numVal(calc['carbsGrams']),
        'fat_grams': diet == 'custom'
            ? numVal(customFields['fat_grams']?.text, numVal(calc['fatGrams']))
            : numVal(calc['fatGrams']),
        'protein_pct': numVal(calc['proteinPct']),
        'carbs_pct': numVal(calc['carbsPct']),
        'fat_pct': numVal(calc['fatPct'])
      });
      if (!mounted) return;
      setState(_load);
      await snack(context, 'Nutrition targets updated');
    } catch (e) {
      if (!mounted) return;
      await showFormaError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) => AsyncContent<(Json, Json)>(
      future: _data,
      onRetry: () => setState(_load),
      builder: (context, d) {
        final plan = asJson(d.$1['plan']), calc = asJson(d.$1['calculated']);
        final active = plan.isNotEmpty &&
                str(plan['diet_type']) == diet &&
                str(plan['activity_level']) == activity
            ? plan
            : calc;
        final log = asJson(d.$2['log']);
        return ListView(padding: const EdgeInsets.all(22), children: [
          PageHeading('Nutrition',
              subtitle: 'Personalized energy and macronutrient targets.'),
          MetricGrid(children: [
            MetricTile(
                label: 'Daily energy',
                value:
                    '${numVal(active['daily_calories'] ?? active['dailyCalories']).round()} kcal',
                detail:
                    'BMR ${numVal(calc['bmr']).round()} · TDEE ${numVal(calc['tdee']).round()} kcal',
                icon: Icons.local_fire_department_outlined),
            MetricTile(
                label: 'Protein',
                value:
                    '${numVal(active['protein_grams'] ?? active['proteinGrams']).round()} g',
                detail:
                    '${numVal(active['protein_pct'] ?? active['proteinPct']).round()}% of target',
                icon: Icons.fitness_center),
            MetricTile(
                label: 'Carbohydrates',
                value:
                    '${numVal(active['carbs_grams'] ?? active['carbsGrams']).round()} g',
                detail:
                    '${numVal(active['carbs_pct'] ?? active['carbsPct']).round()}% of target',
                icon: Icons.grain),
            MetricTile(
                label: 'Fat',
                value:
                    '${numVal(active['fat_grams'] ?? active['fatGrams']).round()} g',
                detail:
                    '${numVal(active['fat_pct'] ?? active['fatPct']).round()}% of target',
                icon: Icons.opacity_outlined)
          ]),
          const SizedBox(height: 14),
          SectionCard(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Row(children: [
                  Icon(Icons.insights_outlined,
                      color: Theme.of(context).colorScheme.primary),
                  const SizedBox(width: 9),
                  Expanded(
                      child: Text('Today’s progress',
                          style: Theme.of(context).textTheme.titleLarge)),
                  Text(today(), style: Theme.of(context).textTheme.bodySmall)
                ]),
                const SizedBox(height: 16),
                LayoutBuilder(builder: (context, box) {
                  final columns = box.maxWidth >= 760 ? 2 : 1;
                  final width = (box.maxWidth - (columns - 1) * 14) / columns;
                  final macros = <(String, String, String, IconData)>[
                    (
                      'Calories',
                      'calories',
                      'daily_calories',
                      Icons.local_fire_department_outlined
                    ),
                    (
                      'Protein',
                      'protein_grams',
                      'protein_grams',
                      Icons.fitness_center
                    ),
                    (
                      'Carbohydrates',
                      'carbs_grams',
                      'carbs_grams',
                      Icons.grain
                    ),
                    ('Fat', 'fat_grams', 'fat_grams', Icons.opacity_outlined),
                  ];
                  return Wrap(spacing: 14, runSpacing: 14, children: [
                    for (final item in macros)
                      SizedBox(
                          width: width,
                          child: Builder(builder: (context) {
                            final consumed = numVal(log[item.$2]);
                            final goal = numVal(active[item.$3] ??
                                active[{
                                  'daily_calories': 'dailyCalories',
                                  'protein_grams': 'proteinGrams',
                                  'carbs_grams': 'carbsGrams',
                                  'fat_grams': 'fatGrams',
                                }[item.$3]]);
                            final ratio = goal <= 0
                                ? 0.0
                                : (consumed / goal).clamp(0.0, 1.0).toDouble();
                            return Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .surfaceContainerLow,
                                    borderRadius: BorderRadius.circular(16)),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(children: [
                                        Icon(item.$4,
                                            size: 18,
                                            color: Theme.of(context)
                                                .colorScheme
                                                .primary),
                                        const SizedBox(width: 8),
                                        Expanded(
                                            child: Text(item.$1,
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .titleSmall
                                                    ?.copyWith(
                                                        fontWeight:
                                                            FontWeight.w700))),
                                        Text(
                                            '${consumed.round()} / ${goal.round()} ${item.$2 == 'calories' ? 'kcal' : 'g'}',
                                            style: Theme.of(context)
                                                .textTheme
                                                .labelMedium)
                                      ]),
                                      const SizedBox(height: 10),
                                      ClipRRect(
                                          borderRadius:
                                              BorderRadius.circular(99),
                                          child: LinearProgressIndicator(
                                              value: ratio, minHeight: 8)),
                                      const SizedBox(height: 5),
                                      Text(
                                          goal > 0
                                              ? '${(ratio * 100).round()}% of daily target'
                                              : 'Set a target to track progress',
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall)
                                    ]));
                          }))
                  ]);
                })
              ])),
          const SizedBox(height: 14),
          if (diet == 'custom')
            SectionCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Custom daily targets',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  for (final item in [
                    ('daily_calories', 'Calories (kcal)', 'dailyCalories'),
                    ('protein_grams', 'Protein (g)', 'proteinGrams'),
                    ('carbs_grams', 'Carbohydrates (g)', 'carbsGrams'),
                    ('fat_grams', 'Fat (g)', 'fatGrams')
                  ])
                    Padding(
                        padding: const EdgeInsets.only(bottom: 9),
                        child: TextField(
                            controller: _customField(
                                item.$1, plan[item.$1] ?? calc[item.$3]),
                            keyboardType: TextInputType.number,
                            decoration: InputDecoration(labelText: item.$2))),
                ])),
          const SizedBox(height: 14),
          SectionCard(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('Plan preferences',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 10),
                Wrap(spacing: 12, runSpacing: 10, children: [
                  SizedBox(
                      width: 260,
                      child: DropdownButtonFormField<String>(
                          initialValue: diet,
                          decoration: const InputDecoration(
                              labelText: 'Diet archetype'),
                          items: const [
                            (
                              'high_protein_low_carb',
                              'High protein / lower carb'
                            ),
                            ('keto', 'Keto'),
                            ('balanced', 'Balanced'),
                            ('mediterranean', 'Mediterranean'),
                            ('carnivore', 'Carnivore'),
                            ('custom', 'Custom')
                          ]
                              .map((e) => DropdownMenuItem(
                                  value: e.$1, child: Text(e.$2)))
                              .toList(),
                          onChanged: (v) {
                            if (v != null) {
                              setState(() => diet = v);
                              _previewPlan();
                            }
                          })),
                  SizedBox(
                      width: 240,
                      child: DropdownButtonFormField<String>(
                          initialValue: activity,
                          decoration: const InputDecoration(
                              labelText: 'Activity level'),
                          items: const [
                            ('sedentary', 'Sedentary'),
                            ('light', 'Light'),
                            ('moderate', 'Moderate'),
                            ('very_active', 'Very active'),
                            ('extra_active', 'Extra active')
                          ]
                              .map((e) => DropdownMenuItem(
                                  value: e.$1, child: Text(e.$2)))
                              .toList(),
                          onChanged: (v) {
                            if (v != null) {
                              setState(() => activity = v);
                              _previewPlan();
                            }
                          })),
                  FilledButton(
                      onPressed: () => _savePlan(calc),
                      child: const Text('Save targets'))
                ]),
                const SizedBox(height: 8),
                Text(
                    'Estimated BMR ${numVal(calc['bmr']).round()} kcal · TDEE ${numVal(calc['tdee']).round()} kcal',
                    style: Theme.of(context).textTheme.bodySmall)
              ])),
          const SizedBox(height: 14),
          SectionCard(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('Today’s intake · ${today()}',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 6),
                Text(
                    'Record your totals for the day. You can update these values anytime.',
                    style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 14),
                LayoutBuilder(builder: (context, box) {
                  final columns = box.maxWidth >= 900
                      ? 4
                      : box.maxWidth >= 560
                          ? 2
                          : 1;
                  final width = (box.maxWidth - (columns - 1) * 12) / columns;
                  return Wrap(spacing: 12, runSpacing: 12, children: [
                    for (final f in [
                      ('calories', 'Calories', 'kcal'),
                      ('protein_grams', 'Protein', 'g'),
                      ('carbs_grams', 'Carbohydrates', 'g'),
                      ('fat_grams', 'Fat', 'g')
                    ])
                      SizedBox(
                          width: width,
                          child: TextField(
                              controller: _field(f.$1, log[f.$1]),
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                      decimal: true),
                              decoration: InputDecoration(
                                  labelText: f.$2, suffixText: f.$3)))
                  ]);
                }),
                const SizedBox(height: 12),
                TextField(
                    controller: _field('notes', log['notes']),
                    minLines: 2,
                    maxLines: 4,
                    decoration: const InputDecoration(
                        labelText: 'Notes', alignLabelWithHint: true)),
                const SizedBox(height: 12),
                FilledButton(
                    onPressed: _saveLog,
                    child: const Text('Save today’s intake'))
              ])),
          const SizedBox(height: 14),
          FutureBuilder<Json>(
              future: widget.api.getMap(
                  '/nutrition/logs?from=${DateTime.now().subtract(const Duration(days: 30)).toIso8601String().substring(0, 10)}&to=${today()}'),
              builder: (context, snapshot) {
                if (!snapshot.hasData) return const SizedBox.shrink();
                final logs = asList(snapshot.data!['logs']);
                return SectionCard(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text('Recent daily logs',
                          style: Theme.of(context).textTheme.titleLarge),
                      if (logs.isEmpty)
                        const Padding(
                            padding: EdgeInsets.only(top: 10),
                            child: Text(
                                'Your saved nutrition days will appear here.')),
                      for (final raw in logs.take(12))
                        Builder(builder: (context) {
                          final row = asJson(raw);
                          return ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                  '${row['date']} · ${numVal(row['calories']).round()} kcal'),
                              subtitle: Text(
                                  'Protein ${numVal(row['protein_grams']).round()} g · Carbs ${numVal(row['carbs_grams']).round()} g · Fat ${numVal(row['fat_grams']).round()} g'));
                        }),
                    ]));
              }),
        ]);
      });
}

class FastingScreen extends StatefulWidget {
  const FastingScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<FastingScreen> createState() => _FastingScreenState();
}

class _FastingScreenState extends State<FastingScreen> {
  late Future<(Json, Json)> _data;
  late Future<Json> _token;
  Timer? _clock;
  String duration = '16';
  @override
  void initState() {
    super.initState();
    _load();
    _token = widget.api.getMap('/fasting/widget-token');
    _clock = Timer.periodic(
        const Duration(seconds: 1), (_) => mounted ? setState(() {}) : null);
  }

  void _load() => _data = Future.wait<dynamic>([
        widget.api.getMap('/fasting/active'),
        widget.api.getMap('/fasting/history')
      ]).then((v) => (asJson(v[0]), asJson(v[1])));
  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  Future<void> _start() async {
    try {
      await widget.api.post('/fasting/start', {
        'fast_type': '$duration:8',
        'target_duration_hours': numVal(duration)
      });
      if (!mounted) return;
      setState(_load);
    } catch (e) {
      if (!mounted) return;
      await showFormaError(context, e);
    }
  }

  Future<void> _end() async {
    try {
      await widget.api.post('/fasting/end', {'status': 'completed'});
      if (!mounted) return;
      setState(_load);
    } catch (e) {
      if (!mounted) return;
      await showFormaError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) => AsyncContent<(Json, Json)>(
      future: _data,
      onRetry: () => setState(_load),
      builder: (context, d) {
        final active = asJson(d.$1['activeFast']),
            history = asJson(d.$2),
            stats = asJson(history['stats']),
            sessions = asList(history['sessions']);
        final start = DateTime.tryParse(str(active['started_at'], ''));
        final hours = start == null
            ? 0.0
            : DateTime.now().difference(start).inSeconds / 3600;
        final target = numVal(active['target_duration_hours'], 16);
        final p =
            target <= 0 ? 0.0 : (hours / target).clamp(0.0, 1.0).toDouble();
        const stages = <(double, double, String, String, String, List<String>)>[
          (
            0,
            4,
            'Fed & anabolic state',
            'Digestion and nutrient absorption',
            'Your body is processing the previous meal; blood glucose and insulin respond to the nutrients consumed.',
            [
              'Nutrients are absorbed and used by tissues',
              'Some glucose is stored as glycogen',
              'Digestion is still active'
            ]
          ),
          (
            4,
            8,
            'Post-absorptive state',
            'Blood sugar returns toward baseline',
            'As digestion winds down, the body draws on stored fuels to help maintain blood glucose.',
            [
              'Insulin levels generally fall after a meal',
              'The liver releases stored glucose as needed',
              'Fuel use shifts gradually between sources'
            ]
          ),
          (
            8,
            12,
            'Early fat use',
            'Stored fuels contribute more energy',
            'With time since the last meal, the body increasingly uses stored energy. The timing varies by person and meal.',
            [
              'Liver glycogen continues to be used',
              'Fatty acids may contribute more fuel',
              'Hydration and how you feel still matter'
            ]
          ),
          (
            12,
            16,
            'The metabolic transition',
            'A gradual shift in fuel use',
            'This part of a fast is often described as a transition toward greater fat oxidation. It is not a precise switch and varies between people.',
            [
              'The body continues to draw on stored fuels',
              'Ketone production may begin to rise',
              'Responses depend on activity and prior meals'
            ]
          ),
          (
            16,
            24,
            'Longer fasting window',
            'Individual responses vary',
            'Longer fasts affect people differently. This tracker marks elapsed time; it cannot measure ketones or cellular processes.',
            [
              'Fuel use continues to adapt',
              'Energy and concentration can vary',
              'Stop if you feel unwell'
            ]
          ),
          (
            24,
            48,
            'Extended fast',
            'Use care with longer fasts',
            'Fasts extending beyond a day can carry health risks. Consider medical guidance, especially with health conditions or medication.',
            [
              'Stay attentive to symptoms',
              'Do not treat the timer as a health assessment',
              'Seek medical advice when unsure'
            ]
          ),
          (
            48,
            168,
            'Prolonged fast',
            'Medical guidance is recommended',
            'Prolonged fasting is not appropriate for everyone. Consult a healthcare professional before attempting it.',
            [
              'The app only reports elapsed time',
              'End the fast if you feel unwell',
              'Get professional guidance'
            ]
          ),
        ];
        var stageIndex = stages.lastIndexWhere((s) => hours >= s.$1);
        if (stageIndex < 0) stageIndex = 0;
        if (stageIndex >= stages.length) stageIndex = stages.length - 1;
        final currentStage = stages[stageIndex];
        final nextStage =
            stageIndex + 1 < stages.length ? stages[stageIndex + 1] : null;
        final stageProgress =
            ((hours - currentStage.$1) / (currentStage.$2 - currentStage.$1))
                .clamp(0.0, 1.0)
                .toDouble();
        return ListView(padding: const EdgeInsets.all(22), children: [
          PageHeading('Fasting',
              subtitle:
                  'A live timer and a clear view of your fasting history.'),
          SectionCard(
              padding: const EdgeInsets.all(22),
              child: LayoutBuilder(builder: (context, constraints) {
                final compact = constraints.maxWidth < 720;
                final timer = Column(mainAxisSize: MainAxisSize.min, children: [
                  if (active.isNotEmpty) ...[
                    SizedBox(
                        width: 220,
                        height: 220,
                        child: Stack(alignment: Alignment.center, children: [
                          SizedBox.expand(
                              child: CircularProgressIndicator(
                                  value: p,
                                  strokeWidth: 13,
                                  backgroundColor: Theme.of(context)
                                      .colorScheme
                                      .surfaceContainerHighest)),
                          Column(mainAxisSize: MainAxisSize.min, children: [
                            Text(currentStage.$3.toUpperCase(),
                                textAlign: TextAlign.center,
                                style: Theme.of(context)
                                    .textTheme
                                    .labelSmall
                                    ?.copyWith(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .primary,
                                        fontWeight: FontWeight.w800)),
                            const SizedBox(height: 8),
                            Text(_duration(hours),
                                style: Theme.of(context)
                                    .textTheme
                                    .headlineMedium
                                    ?.copyWith(
                                        fontWeight: FontWeight.w700,
                                        fontFeatures: [
                                      const FontFeature.tabularFigures()
                                    ])),
                            Text(
                                '${(target - hours).clamp(0, target).toStringAsFixed(1)} h to target',
                                style: Theme.of(context).textTheme.bodySmall),
                          ])
                        ])),
                    FilledButton.icon(
                        onPressed: _end,
                        icon: const Icon(Icons.stop_circle_outlined),
                        label: const Text('End fast'))
                  ] else ...[
                    Text('Start a fast',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                        initialValue: duration,
                        decoration:
                            const InputDecoration(labelText: 'Schedule'),
                        items: const [
                          '12',
                          '14',
                          '16',
                          '18',
                          '20',
                          '24',
                          '36',
                          '48'
                        ]
                            .map((v) => DropdownMenuItem(
                                value: v, child: Text('$v hours')))
                            .toList(),
                        onChanged: (v) => setState(() => duration = v ?? '16')),
                    const SizedBox(height: 14),
                    FilledButton.icon(
                        onPressed: _start,
                        icon: const Icon(Icons.play_arrow),
                        label: const Text('Start fasting timer'))
                  ]
                ]);
                final biology = Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                          active.isNotEmpty
                              ? 'CURRENT FASTING STAGE'
                              : 'YOUR FASTING PLAN',
                          style: Theme.of(context)
                              .textTheme
                              .labelMedium
                              ?.copyWith(
                                  color: Theme.of(context).colorScheme.primary,
                                  letterSpacing: 1.1,
                                  fontWeight: FontWeight.w700)),
                      const SizedBox(height: 7),
                      Text(
                          active.isNotEmpty
                              ? currentStage.$3
                              : 'Choose a schedule that works for you',
                          style: Theme.of(context)
                              .textTheme
                              .headlineSmall
                              ?.copyWith(fontWeight: FontWeight.w700)),
                      Text(
                          active.isNotEmpty
                              ? currentStage.$4
                              : 'Start the timer when your fasting window begins.',
                          style: Theme.of(context)
                              .textTheme
                              .titleSmall
                              ?.copyWith(
                                  color:
                                      Theme.of(context).colorScheme.primary)),
                      if (active.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(currentStage.$5,
                            style: Theme.of(context).textTheme.bodyMedium),
                        const SizedBox(height: 14),
                        Text('What to keep in mind',
                            style: Theme.of(context)
                                .textTheme
                                .titleSmall
                                ?.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 6),
                        for (final item in currentStage.$6)
                          Padding(
                              padding: const EdgeInsets.symmetric(vertical: 3),
                              child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Icon(Icons.circle,
                                        size: 7,
                                        color: Theme.of(context)
                                            .colorScheme
                                            .primary),
                                    const SizedBox(width: 9),
                                    Expanded(
                                        child: Text(item,
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodySmall))
                                  ])),
                        const SizedBox(height: 8),
                        ClipRRect(
                            borderRadius: BorderRadius.circular(99),
                            child: LinearProgressIndicator(
                                value: stageProgress, minHeight: 6)),
                        if (nextStage != null)
                          Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                  'Next stage in ${((nextStage.$1 - hours).clamp(0, 999)).toStringAsFixed(1)} hours',
                                  style:
                                      Theme.of(context).textTheme.labelLarge)),
                      ]
                    ]);
                return compact
                    ? Column(
                        children: [timer, const SizedBox(height: 20), biology])
                    : Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                            SizedBox(width: 250, child: timer),
                            const SizedBox(width: 24),
                            Expanded(child: biology)
                          ]);
              })),
          const SizedBox(height: 14),
          MetricGrid(children: [
            MetricTile(
                label: 'Completed fasts',
                value: str(stats['completedFasts'], '0'),
                detail: 'Sessions completed',
                icon: Icons.check_circle_outline),
            MetricTile(
                label: 'Hours fasted',
                value: str(stats['totalHoursFasted'], '0'),
                detail: 'Total recorded time',
                icon: Icons.schedule),
            MetricTile(
                label: 'Longest fast',
                value: '${str(stats['longestFastHours'], '0')} h',
                detail: 'Personal best',
                icon: Icons.emoji_events_outlined)
          ]),
          const SizedBox(height: 14),
          SectionCard(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('History', style: Theme.of(context).textTheme.titleLarge),
                if (sessions.isEmpty)
                  emptyMessage(context, 'Your completed fasts will appear here',
                      'Start a fast to begin your history.'),
                for (final raw in sessions)
                  Builder(builder: (context) {
                    final s = asJson(raw);
                    final delta = DateTime.tryParse(str(s['ended_at'], ''))
                            ?.difference(
                                DateTime.tryParse(str(s['started_at'], '')) ??
                                    DateTime.now())
                            .inMinutes ??
                        0;
                    return ListTile(
                        leading: const Icon(Icons.history),
                        title: Text(
                            '${s['fast_type']} · ${(delta / 60).toStringAsFixed(1)} hours'),
                        subtitle: Text(
                            '${displayDate(s['started_at'])} – ${displayDate(s['ended_at'])} · ${str(s['status'])}'),
                        trailing: IconButton(
                            tooltip: 'Delete record',
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () async {
                              if (!await confirmAction(
                                  context,
                                  'Delete fasting record?',
                                  'This removes this session from your history.')) {
                                return;
                              }
                              try {
                                await widget.api.delete('/fasting/${s['id']}');
                                if (context.mounted) setState(_load);
                              } catch (e) {
                                if (context.mounted) {
                                  await showFormaError(context, e);
                                }
                              }
                            }));
                  })
              ])),
          const SizedBox(height: 14),
          if (active.isNotEmpty)
            SectionCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Fasting timeline',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  Text(
                      'Illustrative milestones only; individual responses vary.',
                      style: Theme.of(context).textTheme.bodySmall),
                  const SizedBox(height: 14),
                  LayoutBuilder(builder: (context, box) {
                    final columns = box.maxWidth >= 1000
                        ? 4
                        : box.maxWidth >= 600
                            ? 2
                            : 1;
                    final width = (box.maxWidth - (columns - 1) * 10) / columns;
                    return Wrap(spacing: 10, runSpacing: 10, children: [
                      for (var i = 0; i < stages.length; i++)
                        SizedBox(
                            width: width,
                            child: Container(
                                padding: const EdgeInsets.all(14),
                                decoration: BoxDecoration(
                                    color: i == stageIndex
                                        ? Theme.of(context)
                                            .colorScheme
                                            .primaryContainer
                                            .withValues(alpha: .45)
                                        : Theme.of(context)
                                            .colorScheme
                                            .surfaceContainerLow,
                                    border: Border.all(
                                        color: i == stageIndex
                                            ? Theme.of(context)
                                                .colorScheme
                                                .primary
                                            : Theme.of(context)
                                                .colorScheme
                                                .outlineVariant),
                                    borderRadius: BorderRadius.circular(16)),
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                          '${stages[i].$1.toInt()}–${stages[i].$2.toInt()} h',
                                          style: Theme.of(context)
                                              .textTheme
                                              .labelMedium
                                              ?.copyWith(
                                                  fontWeight: FontWeight.w700)),
                                      const SizedBox(height: 6),
                                      Text(stages[i].$3,
                                          style: Theme.of(context)
                                              .textTheme
                                              .titleSmall
                                              ?.copyWith(
                                                  fontWeight: FontWeight.w700)),
                                      const SizedBox(height: 4),
                                      Text(
                                          i < stageIndex
                                              ? 'Elapsed'
                                              : i == stageIndex
                                                  ? 'Current'
                                                  : 'Upcoming',
                                          style: Theme.of(context)
                                              .textTheme
                                              .labelSmall
                                              ?.copyWith(
                                                  color: i == stageIndex
                                                      ? Theme.of(context)
                                                          .colorScheme
                                                          .primary
                                                      : null))
                                    ]))),
                    ]);
                  }),
                ])),
          SectionCard(
              child: FutureBuilder<Json>(
                  future: _token,
                  builder: (context, snapshot) {
                    if (!snapshot.hasData) {
                      return const LinearProgressIndicator();
                    }
                    final token = str(snapshot.data!['token'], '');
                    final origin = Uri.parse(widget.api.dio.options.baseUrl)
                        .replace(path: '')
                        .toString();
                    final link = '$origin/fasting/widget?token=$token';
                    return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Shareable fasting widget',
                              style: Theme.of(context).textTheme.titleLarge),
                          const SizedBox(height: 6),
                          const Text(
                              'Anyone with this private link can view your current fasting timer.'),
                          const SizedBox(height: 8),
                          SelectableText(link),
                          Wrap(spacing: 8, children: [
                            OutlinedButton.icon(
                                onPressed: () async {
                                  await Clipboard.setData(
                                      ClipboardData(text: link));
                                  if (context.mounted) {
                                    await snack(context, 'Widget link copied');
                                  }
                                },
                                icon: const Icon(Icons.copy_outlined),
                                label: const Text('Copy link')),
                            TextButton(
                                onPressed: () async {
                                  if (!await confirmAction(
                                      context,
                                      'Regenerate widget link?',
                                      'The current link will stop working.')) {
                                    return;
                                  }
                                  try {
                                    await widget.api.postDynamic(
                                        '/fasting/widget-token/regenerate');
                                    if (context.mounted) {
                                      setState(() => _token = widget.api
                                          .getMap('/fasting/widget-token'));
                                    }
                                  } catch (e) {
                                    if (context.mounted) {
                                      await showFormaError(context, e);
                                    }
                                  }
                                },
                                child: const Text('Regenerate')),
                          ]),
                        ]);
                  })),
        ]);
      });
  String _duration(double h) =>
      '${h.floor().toString().padLeft(2, '0')}:${((h * 60).floor() % 60).toString().padLeft(2, '0')}:${((h * 3600).floor() % 60).toString().padLeft(2, '0')}';
}
