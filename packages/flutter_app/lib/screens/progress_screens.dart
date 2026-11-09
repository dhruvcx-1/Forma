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
        final progress = target > 0 && start > 0 && weight > 0
            ? ((weight - start) / (target - start)).clamp(0.0, 1.0)
            : 0.0;
        final days = DateTime.tryParse(
                str(goal['target_date'] ?? goal['targetDate'], ''))
            ?.difference(DateTime.now())
            .inDays;
        return ListView(padding: const EdgeInsets.all(22), children: [
          PageHeading('Goals',
              subtitle: 'Set a target and see how your latest trend relates.'),
          SectionCard(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Row(children: [
                  Expanded(
                      child: Text(
                          target > 0
                              ? 'Your weight target'
                              : 'Build a goal that fits you',
                          style: Theme.of(context).textTheme.titleLarge)),
                  IconButton(
                      onPressed: () => _edit(goal),
                      icon: const Icon(Icons.edit_outlined))
                ]),
                const SizedBox(height: 10),
                if (target > 0) ...[
                  Text(
                      '${target.toStringAsFixed(1)} ${str(goal['target_weight_unit'], 'kg')}',
                      style: Theme.of(context)
                          .textTheme
                          .displaySmall
                          ?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  LinearProgressIndicator(
                      value: progress,
                      minHeight: 8,
                      borderRadius: BorderRadius.circular(6)),
                  const SizedBox(height: 8),
                  Text(
                      'Current ${weight > 0 ? weight.toStringAsFixed(1) : '—'} kg · ${days == null ? 'No target date' : days < 0 ? 'Target date passed' : '$days days remaining'}'),
                  if (start > 0 && target > 0 && days != null && days > 0) ...[
                    const SizedBox(height: 14),
                    Text(
                        'Planned pace: ${((target - start) / days * 7).toStringAsFixed(2)} kg per week',
                        style: Theme.of(context).textTheme.titleMedium)
                  ],
                  if (str(goal['notes'], '').isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(str(goal['notes']))
                  ]
                ] else ...[
                  emptyMessage(context, 'A goal gives your progress direction',
                      'Add a starting weight, target and optional date.'),
                  Center(
                      child: FilledButton.icon(
                          onPressed: () => _edit(goal),
                          icon: const Icon(Icons.flag_outlined),
                          label: const Text('Set a goal')))
                ]
              ])),
          const SizedBox(height: 14),
          SectionCard(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text('Milestones',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 12),
                if (target > 0 && start > 0)
                  for (final p in [.25, .5, .75, 1.0])
                    ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(
                            p <= progress
                                ? Icons.check_circle
                                : Icons.circle_outlined,
                            color: p <= progress
                                ? Theme.of(context).colorScheme.primary
                                : null),
                        title: Text('${(p * 100).round()}% of the way'),
                        trailing: Text(
                            '${(start + (target - start) * p).toStringAsFixed(1)} kg'))
                else
                  const Text(
                      'Set a starting and target weight to see milestones.')
              ]))
        ]);
      });
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
          Wrap(spacing: 12, runSpacing: 12, children: [
            SizedBox(
                width: 190,
                child: MetricTile(
                    label: 'Daily calories',
                    value:
                        '${numVal(active['daily_calories'] ?? active['dailyCalories']).round()} kcal',
                    icon: Icons.local_fire_department_outlined)),
            SizedBox(
                width: 190,
                child: MetricTile(
                    label: 'Protein',
                    value:
                        '${numVal(active['protein_grams'] ?? active['proteinGrams']).round()} g',
                    icon: Icons.fitness_center)),
            SizedBox(
                width: 190,
                child: MetricTile(
                    label: 'Carbohydrates',
                    value:
                        '${numVal(active['carbs_grams'] ?? active['carbsGrams']).round()} g',
                    icon: Icons.grain)),
            SizedBox(
                width: 190,
                child: MetricTile(
                    label: 'Fat',
                    value:
                        '${numVal(active['fat_grams'] ?? active['fatGrams']).round()} g',
                    icon: Icons.opacity_outlined))
          ]),
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
                const SizedBox(height: 10),
                for (final f in [
                  ('calories', 'Calories (kcal)'),
                  ('protein_grams', 'Protein (g)'),
                  ('carbs_grams', 'Carbohydrates (g)'),
                  ('fat_grams', 'Fat (g)')
                ])
                  Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: TextField(
                          controller: _field(f.$1, log[f.$1]),
                          keyboardType: TextInputType.number,
                          decoration: InputDecoration(labelText: f.$2))),
                TextField(
                    controller: _field('notes', log['notes']),
                    decoration: const InputDecoration(labelText: 'Notes')),
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
        final stage = hours < 4
            ? 'Fed and anabolic'
            : hours < 8
                ? 'Post-absorptive'
                : hours < 12
                    ? 'Early fat burning'
                    : hours < 16
                        ? 'Metabolic switch'
                        : hours < 24
                            ? 'Deep ketosis'
                            : hours < 48
                                ? 'Peak autophagy'
                                : 'Extended fast';
        return ListView(padding: const EdgeInsets.all(22), children: [
          PageHeading('Fasting',
              subtitle:
                  'A live timer and a clear view of your fasting history.'),
          SectionCard(
              child: Column(children: [
            if (active.isNotEmpty) ...[
              Text('FAST IN PROGRESS',
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      letterSpacing: 1.5,
                      color: Theme.of(context).colorScheme.primary)),
              const SizedBox(height: 18),
              Text(_duration(hours),
                  style: Theme.of(context).textTheme.displayMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      fontFeatures: [const FontFeature.tabularFigures()])),
              const SizedBox(height: 8),
              Text(
                  '$stage · ${hours.toStringAsFixed(1)} of ${target.toStringAsFixed(0)} hours'),
              const SizedBox(height: 18),
              LinearProgressIndicator(
                  value: p,
                  minHeight: 8,
                  borderRadius: BorderRadius.circular(6)),
              const SizedBox(height: 18),
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
                  decoration: const InputDecoration(labelText: 'Schedule'),
                  items: const ['12', '14', '16', '18', '20', '24', '36', '48']
                      .map((v) =>
                          DropdownMenuItem(value: v, child: Text('$v hours')))
                      .toList(),
                  onChanged: (v) => setState(() => duration = v ?? '16')),
              const SizedBox(height: 14),
              FilledButton.icon(
                  onPressed: _start,
                  icon: const Icon(Icons.play_arrow),
                  label: const Text('Start fasting timer'))
            ]
          ])),
          const SizedBox(height: 14),
          Wrap(spacing: 12, runSpacing: 12, children: [
            SizedBox(
                width: 185,
                child: MetricTile(
                    label: 'Completed fasts',
                    value: str(stats['completedFasts'], '0'),
                    icon: Icons.check_circle_outline)),
            SizedBox(
                width: 185,
                child: MetricTile(
                    label: 'Hours fasted',
                    value: str(stats['totalHoursFasted'], '0'),
                    icon: Icons.schedule)),
            SizedBox(
                width: 185,
                child: MetricTile(
                    label: 'Longest',
                    value: '${str(stats['longestFastHours'], '0')} h',
                    icon: Icons.emoji_events_outlined))
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
                  Text('Fasting stages',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  for (final stageRow in [
                    ('0–4 h', 'Fed and anabolic'),
                    ('4–8 h', 'Post-absorptive'),
                    ('8–12 h', 'Early fat burning'),
                    ('12–16 h', 'Metabolic switch'),
                    ('16–24 h', 'Deep ketosis'),
                    ('24–48 h', 'Peak autophagy'),
                    ('48+ h', 'Extended fast')
                  ])
                    ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: Icon(
                            stage == stageRow.$2
                                ? Icons.radio_button_checked
                                : Icons.radio_button_unchecked,
                            color: stage == stageRow.$2
                                ? Theme.of(context).colorScheme.primary
                                : null),
                        title: Text(stageRow.$2),
                        trailing: Text(stageRow.$1)),
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
