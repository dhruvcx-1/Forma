import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../data/api_client.dart';
import '../widgets/forma_widgets.dart';
import 'shared.dart';

class WeightScreen extends StatefulWidget {
  const WeightScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<WeightScreen> createState() => _WeightScreenState();
}

class _WeightScreenState extends State<WeightScreen> {
  late Future<(Json, List<dynamic>)> _data;
  int days = 90;
  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => _data = Future.wait<dynamic>([
        widget.api.getMap('/weight/stats'),
        widget.api.getList('/weight?limit=500'),
      ]).then((v) => (asJson(v[0]), asList(v[1])));

  Future<void> _add({Json? entry}) async {
    final value = TextEditingController(
        text: entry == null ? '' : str(entry['value'] ?? entry['weight'], ''));
    final notes = TextEditingController(text: str(entry?['notes'], ''));
    final date = TextEditingController(
        text: str(entry?['recorded_at'] ?? entry?['date'], today())
            .split('T')
            .first);
    var unit = str(entry?['unit'], 'kg');
    final form = GlobalKey<FormState>();
    final result = await showDialog<(String, String, String, String)?>(
        context: context,
        builder: (context) => StatefulBuilder(
            builder: (context, setDialog) => AlertDialog(
                  title: Text(entry == null ? 'Log weight' : 'Edit entry'),
                  content: Form(
                      key: form,
                      child: SizedBox(
                          width: 420,
                          child:
                              Column(mainAxisSize: MainAxisSize.min, children: [
                            TextFormField(
                                controller: value,
                                autofocus: true,
                                keyboardType:
                                    const TextInputType.numberWithOptions(
                                        decimal: true),
                                decoration:
                                    const InputDecoration(labelText: 'Weight'),
                                validator: (v) => numVal(v, -1) <= 0
                                    ? 'Enter a positive weight'
                                    : null),
                            const SizedBox(height: 10),
                            Row(children: [
                              Expanded(
                                  child: TextFormField(
                                      controller: date,
                                      decoration: const InputDecoration(
                                          labelText: 'Date (YYYY-MM-DD)'),
                                      validator: (v) =>
                                          DateTime.tryParse(v ?? '') == null
                                              ? 'Enter a valid date'
                                              : null)),
                              const SizedBox(width: 10),
                              DropdownButton<String>(
                                  value: unit,
                                  items: const [
                                    DropdownMenuItem(
                                        value: 'kg', child: Text('kg')),
                                    DropdownMenuItem(
                                        value: 'lbs', child: Text('lbs'))
                                  ],
                                  onChanged: (v) =>
                                      setDialog(() => unit = v ?? 'kg'))
                            ]),
                            const SizedBox(height: 10),
                            TextField(
                                controller: notes,
                                decoration: const InputDecoration(
                                    labelText: 'Notes (optional)')),
                          ]))),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Cancel')),
                    FilledButton(
                        onPressed: () {
                          if (form.currentState!.validate()) {
                            Navigator.pop(context,
                                (value.text, date.text, unit, notes.text));
                          }
                        },
                        child: const Text('Save'))
                  ],
                )));
    if (result == null) return;
    try {
      final payload = {
        'value': numVal(result.$1),
        'unit': result.$3,
        'recorded_at': result.$2,
        'notes': result.$4
      };
      if (entry == null) {
        await widget.api.post('/weight', payload);
      } else {
        await widget.api.put('/weight/${entry['id']}', payload);
      }
      if (!mounted) return;
      setState(_load);
      await snack(context, 'Weight saved');
    } catch (e) {
      if (!mounted) return;
      await showFormaError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) => AsyncContent<(Json, List<dynamic>)>(
      future: _data,
      onRetry: () => setState(_load),
      builder: (context, data) {
        final stats = data.$1;
        final all = data.$2;
        final entries = all
            .where((e) {
              final date = DateTime.tryParse(
                  str(asJson(e)['recorded_at'] ?? asJson(e)['date'], ''));
              return date != null &&
                  DateTime.now().difference(date).inDays <= days;
            })
            .toList()
            .reversed
            .toList();
        final cur = asJson(stats['currentWeight']);
        return ListView(
            padding: const EdgeInsets.fromLTRB(20, 22, 20, 28),
            children: [
              PageHeading('Weight',
                  subtitle: 'Track your trend with precise daily entries.',
                  trailing: FilledButton.icon(
                      onPressed: _add,
                      icon: const Icon(Icons.add),
                      label: const Text('Log weight'))),
              Wrap(spacing: 12, runSpacing: 12, children: [
                SizedBox(
                    width: 205,
                    child: MetricTile(
                        label: 'Current',
                        value: cur.isEmpty
                            ? '—'
                            : '${numVal(cur['value']).toStringAsFixed(1)} kg',
                        detail: displayDate(cur['recorded_at']),
                        icon: Icons.monitor_weight_outlined)),
                SizedBox(
                    width: 205,
                    child: MetricTile(
                        label: 'Total change',
                        value: stats['totalChange'] == null
                            ? '—'
                            : '${numVal(stats['totalChange']).toStringAsFixed(1)} kg',
                        detail: stats['percentChange'] == null
                            ? 'Start logging to see change'
                            : '${stats['percentChange']}% overall',
                        icon: Icons.trending_down)),
                SizedBox(
                    width: 205,
                    child: MetricTile(
                        label: 'Trend rate',
                        value: stats['trend'] == null
                            ? '—'
                            : '${numVal(stats['trend']).toStringAsFixed(2)} kg/day',
                        detail: '${all.length} entries',
                        icon: Icons.show_chart)),
              ]),
              const SizedBox(height: 14),
              SectionCard(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Row(children: [
                      Expanded(
                          child: Text('History',
                              style: Theme.of(context).textTheme.titleLarge)),
                      DropdownButton<int>(
                          value: days,
                          items: const [30, 90, 180, 365, 3650]
                              .map((d) => DropdownMenuItem(
                                  value: d,
                                  child:
                                      Text(d == 3650 ? 'All time' : '$d days')))
                              .toList(),
                          onChanged: (v) => setState(() => days = v ?? 90))
                    ]),
                    SizedBox(
                        height: 235, child: WeightLineChart(entries: entries)),
                  ])),
              const SizedBox(height: 14),
              SectionCard(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text('Entries',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    if (all.isEmpty)
                      emptyMessage(context, 'Your first entry starts the trend',
                          'Log your weight to see progress here.'),
                    for (final raw in all)
                      _WeightRow(
                          entry: asJson(raw),
                          onEdit: () => _add(entry: asJson(raw)),
                          onDelete: () async {
                            if (!await confirmAction(
                                context,
                                'Delete weight entry?',
                                'This removes this one measurement.')) {
                              return;
                            }
                            try {
                              await widget.api
                                  .delete('/weight/${asJson(raw)['id']}');
                              if (!context.mounted) return;
                              setState(_load);
                            } catch (e) {
                              if (!context.mounted) return;
                              await showFormaError(context, e);
                            }
                          }),
                  ])),
            ]);
      });
}

class WeightLineChart extends StatelessWidget {
  const WeightLineChart({super.key, required this.entries, this.unit = 'kg'});
  final List<dynamic> entries;
  final String unit;
  @override
  Widget build(BuildContext context) {
    final values = entries
        .map((e) => numVal(asJson(e)['weight'] ?? asJson(e)['value']))
        .toList();
    if (values.isEmpty) {
      return emptyMessage(context, 'No weight entries in this range',
          'Choose another range or add an entry.');
    }
    final min = values.reduce((a, b) => a < b ? a : b),
        max = values.reduce((a, b) => a > b ? a : b);
    final pad = ((max - min) * .15).clamp(0.7, 10.0);
    return LineChart(LineChartData(
      minY: min - pad,
      maxY: max + pad,
      gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => FlLine(
              color: Theme.of(context).dividerColor.withValues(alpha: .2),
              dashArray: [4, 5])),
      borderData: FlBorderData(show: false),
      titlesData: const FlTitlesData(show: false),
      lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
              getTooltipItems: (spots) => spots
                  .map((s) => LineTooltipItem(
                      '${s.y.toStringAsFixed(1)} $unit',
                      const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.w600)))
                  .toList())),
      lineBarsData: [
        LineChartBarData(
            spots: [
              for (var i = 0; i < values.length; i++)
                FlSpot(i.toDouble(), values[i])
            ],
            isCurved: true,
            barWidth: 2.8,
            color: Theme.of(context).colorScheme.primary,
            dotData: FlDotData(show: values.length <= 14),
            belowBarData: BarAreaData(
                show: true,
                color: Theme.of(context)
                    .colorScheme
                    .primary
                    .withValues(alpha: .08)))
      ],
    ));
  }
}

class _WeightRow extends StatelessWidget {
  const _WeightRow(
      {required this.entry, required this.onEdit, required this.onDelete});
  final Json entry;
  final VoidCallback onEdit, onDelete;
  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: CircleAvatar(
            backgroundColor: Theme.of(context).colorScheme.primaryContainer,
            child: Icon(Icons.monitor_weight_outlined,
                color: Theme.of(context).colorScheme.primary)),
        title: Text(
            '${numVal(entry['value'] ?? entry['weight']).toStringAsFixed(1)} ${str(entry['unit'], 'kg')}'),
        subtitle: Text(
            '${displayDate(entry['recorded_at'] ?? entry['date'])}${entry['notes'] == null ? '' : ' · ${entry['notes']}'}'),
        trailing: Wrap(children: [
          IconButton(
              tooltip: 'Edit',
              onPressed: onEdit,
              icon: const Icon(Icons.edit_outlined)),
          IconButton(
              tooltip: 'Delete',
              onPressed: onDelete,
              icon: const Icon(Icons.delete_outline))
        ]),
      );
}

class _BodyHotspot {
  const _BodyHotspot(this.slug, this.x, this.y);
  final String slug;
  final double x, y;
}

const _bodyHotspots = <_BodyHotspot>[
  _BodyHotspot('neck', .50, .23),
  _BodyHotspot('chest', .50, .34),
  _BodyHotspot('waist', .50, .45),
  _BodyHotspot('hips', .50, .54),
  _BodyHotspot('left_upper_arm', .25, .39),
  _BodyHotspot('right_upper_arm', .75, .39),
  _BodyHotspot('left_forearm', .18, .51),
  _BodyHotspot('right_forearm', .82, .51),
  _BodyHotspot('left_thigh', .39, .70),
  _BodyHotspot('right_thigh', .61, .70),
  _BodyHotspot('left_calf', .40, .86),
  _BodyHotspot('right_calf', .60, .86),
];

class _BodyMap extends StatelessWidget {
  const _BodyMap(
      {required this.definitions,
      required this.latest,
      required this.onSelect,
      required this.selectedSlug});
  final List<dynamic> definitions;
  final Map<String, dynamic> latest;
  final ValueChanged<Json> onSelect;
  final String? selectedSlug;

  @override
  Widget build(BuildContext context) {
    final bySlug = {
      for (final raw in definitions) str(asJson(raw)['slug']): asJson(raw)
    };
    return Center(
        child: SizedBox(
            width: 230,
            height: 380,
            child: GestureDetector(
              onTapDown: (event) {
                for (final point in _bodyHotspots) {
                  final dx = event.localPosition.dx / 230 - point.x;
                  final dy = event.localPosition.dy / 380 - point.y;
                  final def = bySlug[point.slug];
                  if (dx * dx + dy * dy < .0038 && def != null) onSelect(def);
                }
              },
              child: CustomPaint(
                  size: const Size(230, 380),
                  painter: _BodyPainter(
                    color: Theme.of(context)
                        .colorScheme
                        .primary
                        .withValues(alpha: .16),
                    dot: Theme.of(context).colorScheme.primary,
                    recorded: {
                      for (final h in _bodyHotspots)
                        if (bySlug[h.slug] case final def?)
                          if (latest[str(def['id'])] != null) h.slug
                    },
                    selected: selectedSlug,
                  )),
            )));
  }
}

class _BodyPainter extends CustomPainter {
  const _BodyPainter(
      {required this.color,
      required this.dot,
      required this.recorded,
      required this.selected});
  final Color color, dot;
  final Set<String> recorded;
  final String? selected;
  @override
  void paint(Canvas canvas, Size size) {
    final fill = Paint()..color = color;
    final w = size.width, h = size.height;
    canvas.drawOval(
        Rect.fromCenter(
            center: Offset(w * .5, h * .105), width: w * .19, height: h * .11),
        fill);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(w * .455, h * .155, w * .09, h * .085),
            const Radius.circular(12)),
        fill);
    final torso = Path()
      ..moveTo(w * .40, h * .21)
      ..quadraticBezierTo(w * .32, h * .22, w * .30, h * .30)
      ..lineTo(w * .35, h * .50)
      ..quadraticBezierTo(w * .50, h * .58, w * .65, h * .50)
      ..lineTo(w * .70, h * .30)
      ..quadraticBezierTo(w * .68, h * .22, w * .60, h * .21)
      ..close();
    canvas.drawPath(torso, fill);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(w * .19, h * .26, w * .11, h * .29),
            const Radius.circular(18)),
        fill);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(w * .70, h * .26, w * .11, h * .29),
            const Radius.circular(18)),
        fill);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(w * .225, h * .48, w * .08, h * .17),
            const Radius.circular(14)),
        fill);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(w * .695, h * .48, w * .08, h * .17),
            const Radius.circular(14)),
        fill);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(w * .36, h * .50, w * .13, h * .25),
            const Radius.circular(19)),
        fill);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(w * .51, h * .50, w * .13, h * .25),
            const Radius.circular(19)),
        fill);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(w * .37, h * .71, w * .105, h * .22),
            const Radius.circular(15)),
        fill);
    canvas.drawRRect(
        RRect.fromRectAndRadius(
            Rect.fromLTWH(w * .525, h * .71, w * .105, h * .22),
            const Radius.circular(15)),
        fill);
    canvas.drawOval(Rect.fromLTWH(w * .31, h * .91, w * .19, h * .055), fill);
    canvas.drawOval(Rect.fromLTWH(w * .50, h * .91, w * .19, h * .055), fill);
    for (final point in _bodyHotspots) {
      final center = Offset(w * point.x, h * point.y);
      final isSelected = point.slug == selected;
      if (isSelected) {
        canvas.drawCircle(
            center, 13, Paint()..color = dot.withValues(alpha: .20));
      }
      canvas.drawCircle(center, 8, Paint()..color = dot.withValues(alpha: .2));
      canvas.drawCircle(center, isSelected ? 6.4 : 4.2,
          Paint()..color = recorded.contains(point.slug) ? dot : Colors.white);
      canvas.drawCircle(
          center,
          isSelected ? 6.4 : 4.2,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.5
            ..color = dot);
    }
  }

  @override
  bool shouldRepaint(covariant _BodyPainter old) =>
      old.color != color ||
      old.dot != dot ||
      old.recorded != recorded ||
      old.selected != selected;
}

class MeasurementsScreen extends StatefulWidget {
  const MeasurementsScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<MeasurementsScreen> createState() => _MeasurementsScreenState();
}

class _MeasurementsScreenState extends State<MeasurementsScreen> {
  late Future<(List<dynamic>, List<dynamic>, Json)> _data;
  String? selectedId;
  String view = 'studio';
  String historyQuery = '';
  final quickValue = TextEditingController();
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    quickValue.dispose();
    super.dispose();
  }

  void _load() => _data = Future.wait<dynamic>([
        widget.api.getList('/measurements/definitions'),
        widget.api.getList('/measurements/entries'),
        widget.api.getMap('/body-composition')
      ]).then((v) => (asList(v[0]), asList(v[1]), asJson(v[2])));

  Future<void> _saveQuick(Json definition) async {
    final value = double.tryParse(quickValue.text.trim());
    if (value == null || value <= 0) {
      await snack(context, 'Enter a measurement greater than zero');
      return;
    }
    try {
      await widget.api.post('/measurements/entries', {
        'entries': [
          {
            'definition_id': definition['id'],
            'value': value,
            'recorded_at': DateTime.now().toIso8601String(),
          }
        ]
      });
      if (!mounted) return;
      setState(_load);
      await snack(context, '${str(definition['name'])} saved');
    } catch (e) {
      if (mounted) await showFormaError(context, e);
    }
  }

  Future<void> _log(List<dynamic> definitions) async {
    if (definitions.isEmpty) return;
    final selected =
        ValueNotifier<String>(str(asJson(definitions.first)['id'], ''));
    final value = TextEditingController();
    final date = TextEditingController(text: today());
    final result = await showDialog<(String, String, String)?>(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Log measurement'),
                content: SizedBox(
                    width: 420,
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      ValueListenableBuilder<String>(
                          valueListenable: selected,
                          builder: (_, id, __) =>
                              DropdownButtonFormField<String>(
                                  initialValue: id,
                                  decoration: const InputDecoration(
                                      labelText: 'Measurement'),
                                  items: definitions.map((d) {
                                    final m = asJson(d);
                                    return DropdownMenuItem(
                                        value: str(m['id']),
                                        child: Text(
                                            '${str(m['name'])} (${str(m['unit'])})'));
                                  }).toList(),
                                  onChanged: (v) => selected.value = v ?? id)),
                      const SizedBox(height: 10),
                      TextField(
                          controller: value,
                          keyboardType: const TextInputType.numberWithOptions(
                              decimal: true),
                          decoration:
                              const InputDecoration(labelText: 'Value')),
                      const SizedBox(height: 10),
                      TextField(
                          controller: date,
                          decoration: const InputDecoration(
                              labelText: 'Date or timestamp')),
                    ])),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () {
                        if (numVal(value.text, -1) < 0) return;
                        Navigator.pop(
                            context, (selected.value, value.text, date.text));
                      },
                      child: const Text('Save'))
                ]));
    if (result == null) return;
    try {
      await widget.api.post('/measurements/entries', {
        'entries': [
          {
            'definition_id': result.$1,
            'value': numVal(result.$2),
            'recorded_at': result.$3
          }
        ]
      });
      if (!mounted) return;
      setState(_load);
    } catch (e) {
      if (!mounted) return;
      await showFormaError(context, e);
    }
  }

  Future<void> _addDefinition() async {
    final name = await askText(context, 'New measurement', label: 'Name');
    if (!mounted || name == null || name.isEmpty) return;
    final unit = await askText(context, 'Measurement unit',
        label: 'Unit', initial: 'cm');
    if (unit == null || unit.isEmpty) return;
    try {
      await widget.api
          .post('/measurements/definitions', {'name': name, 'unit': unit});
      if (!mounted) return;
      setState(_load);
    } catch (e) {
      if (!mounted) return;
      await showFormaError(context, e);
    }
  }

  Future<void> _batchLog(List<dynamic> definitions) async {
    final inputs = <String, TextEditingController>{
      for (final raw in definitions)
        str(asJson(raw)['id']): TextEditingController(),
    };
    final date = TextEditingController(text: today());
    final values = await showDialog<List<(String, double, String)>>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Log a measurement batch'),
        content: SizedBox(
            width: 480,
            height: 480,
            child: Column(children: [
              TextField(
                  controller: date,
                  decoration:
                      const InputDecoration(labelText: 'Recorded date')),
              const SizedBox(height: 8),
              Expanded(
                  child: ListView(children: [
                for (final raw in definitions)
                  Builder(builder: (context) {
                    final d = asJson(raw);
                    final id = str(d['id']);
                    return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: TextField(
                          controller: inputs[id],
                          keyboardType: const TextInputType.numberWithOptions(
                              decimal: true),
                          decoration: InputDecoration(
                              labelText:
                                  '${str(d['name'])} (${str(d['unit'])})'),
                        ));
                  })
              ])),
            ])),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel')),
          FilledButton(
              onPressed: () {
                final entries = inputs.entries
                    .where((e) => e.value.text.trim().isNotEmpty)
                    .map((e) => (e.key, numVal(e.value.text), date.text.trim()))
                    .toList();
                if (entries.isNotEmpty) Navigator.pop(context, entries);
              },
              child: const Text('Save entered values')),
        ],
      ),
    );
    if (values == null) return;
    try {
      await widget.api.post('/measurements/entries/batch', {
        'entries': [
          for (final v in values)
            {'definition_id': v.$1, 'value': v.$2, 'recorded_at': v.$3}
        ]
      });
      if (mounted) setState(_load);
    } catch (e) {
      if (mounted) await showFormaError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) => AsyncContent<
          (List<dynamic>, List<dynamic>, Json)>(
      future: _data,
      onRetry: () => setState(_load),
      builder: (context, d) {
        final definitions = d.$1.map(asJson).toList();
        final entries = d.$2.map(asJson).toList();
        final comp = d.$3;
        final ratios = asJson(comp['ratios']);
        final whtr = asJson(ratios['whtr']);
        final whr = asJson(ratios['whr']);
        final available = asJson(comp['availableData']);
        final bmi = asJson(comp['bmi']);
        final fat = asJson(comp['bodyFat']);
        final latest = <String, Json>{};
        for (final entry in entries) {
          latest.putIfAbsent(str(entry['definition_id']), () => entry);
        }
        Json? selected;
        for (final definition in definitions) {
          if (definition['id'] == selectedId) selected = definition;
        }
        selected ??= definitions.where((d) => d['slug'] == 'waist').firstOrNull;
        selected ??= definitions.isEmpty ? null : definitions.first;
        final selectedSlug = selected == null ? null : str(selected['slug']);
        final selectedEntries = selected == null
            ? <Json>[]
            : entries
                .where((e) => str(e['definition_id']) == str(selected!['id']))
                .toList();
        final current = selectedEntries.isEmpty ? null : selectedEntries.first;
        final baseline = selectedEntries.isEmpty ? null : selectedEntries.last;
        final currentValue = current == null ? null : numVal(current['value']);
        final baselineValue =
            baseline == null ? null : numVal(baseline['value']);
        final delta = currentValue == null || baselineValue == null
            ? null
            : currentValue - baselineValue;

        Widget actions() => Wrap(spacing: 8, runSpacing: 8, children: [
              FilledButton.icon(
                  onPressed:
                      definitions.isEmpty ? null : () => _log(definitions),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Log measurement')),
              OutlinedButton.icon(
                  onPressed:
                      definitions.isEmpty ? null : () => _batchLog(definitions),
                  icon: const Icon(Icons.playlist_add, size: 18),
                  label: const Text('Quick session')),
              IconButton.outlined(
                  tooltip: 'Add custom site',
                  onPressed: _addDefinition,
                  icon: const Icon(Icons.add_business_outlined)),
            ]);

        return LayoutBuilder(builder: (context, outer) {
          final compact = outer.maxWidth < 650;
          return ListView(
              padding: EdgeInsets.fromLTRB(
                  compact ? 16 : 30, 22, compact ? 16 : 30, 32),
              children: [
                PageHeading('Body Measurements',
                    subtitle:
                        'Track circumferences, see how they change, and understand what your measurements mean.',
                    trailing: actions()),
                Align(
                    alignment: Alignment.centerLeft,
                    child: SegmentedButton<String>(
                        showSelectedIcon: false,
                        segments: const [
                          ButtonSegment(
                              value: 'studio',
                              label: Text('Studio'),
                              icon: Icon(Icons.person_outline)),
                          ButtonSegment(
                              value: 'zones',
                              label: Text('Zones'),
                              icon: Icon(Icons.grid_view_outlined)),
                          ButtonSegment(
                              value: 'history',
                              label: Text('History'),
                              icon: Icon(Icons.history)),
                        ],
                        selected: {view},
                        onSelectionChanged: (v) =>
                            setState(() => view = v.first))),
                const SizedBox(height: 18),
                if (view == 'studio') ...[
                  LayoutBuilder(builder: (context, box) {
                    final width = box.maxWidth >= 900
                        ? (box.maxWidth - 16) / 2
                        : box.maxWidth;
                    return Wrap(spacing: 16, runSpacing: 16, children: [
                      SizedBox(
                          width: width,
                          child: _RatioInsightCard(
                              title: 'Waist-to-Hip Ratio',
                              abbreviation: 'WHR',
                              subtitle: 'Body-fat distribution indicator',
                              value: numVal(whr['ratio'], -1),
                              category:
                                  str(whr['category'], 'Needs measurements'),
                              inputs:
                                  'Waist ${str(available['waistCm'], '—')} cm  ·  Hips ${str(available['hipsCm'], '—')} cm',
                              icon: Icons.favorite_outline,
                              isWaistHeight: false,
                              female: str(available['sex']) == 'female')),
                      SizedBox(
                          width: width,
                          child: _RatioInsightCard(
                              title: 'Waist-to-Height Ratio',
                              abbreviation: 'WHtR',
                              subtitle:
                                  'Keep your waist below half your height',
                              value: numVal(whtr['ratio'], -1),
                              category:
                                  str(whtr['category'], 'Needs measurements'),
                              inputs:
                                  'Waist ${str(available['waistCm'], '—')} cm  ·  Height ${str(available['heightCm'], '—')} cm',
                              icon: Icons.health_and_safety_outlined,
                              isWaistHeight: true,
                              female: false)),
                    ]);
                  }),
                  const SizedBox(height: 16),
                  LayoutBuilder(builder: (context, box) {
                    final map = SectionCard(
                        padding: const EdgeInsets.fromLTRB(18, 18, 18, 14),
                        child: Column(children: [
                          Text('INTERACTIVE BODY MAP',
                              style: Theme.of(context)
                                  .textTheme
                                  .labelSmall
                                  ?.copyWith(
                                      color:
                                          Theme.of(context).colorScheme.primary,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 1.2)),
                          const SizedBox(height: 4),
                          Text('Tap a point to inspect that site',
                              style: Theme.of(context).textTheme.bodySmall),
                          const SizedBox(height: 8),
                          _BodyMap(
                              definitions: definitions,
                              latest: latest,
                              selectedSlug: selectedSlug,
                              onSelect: (d) => setState(() {
                                    selectedId = str(d['id']);
                                    quickValue.clear();
                                  })),
                          const Divider(height: 12),
                          Wrap(spacing: 16, children: [
                            _LegendDot(
                                color: Theme.of(context).colorScheme.primary,
                                label: 'Recorded'),
                            _LegendDot(
                                color: Theme.of(context).colorScheme.outline,
                                label: 'Not recorded'),
                          ])
                        ]));
                    final inspector = SectionCard(
                        padding: const EdgeInsets.all(22),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('SELECTED ANATOMICAL SITE',
                                  style: Theme.of(context)
                                      .textTheme
                                      .labelSmall
                                      ?.copyWith(
                                          color: Theme.of(context)
                                              .colorScheme
                                              .primary,
                                          fontWeight: FontWeight.w800,
                                          letterSpacing: 1.1)),
                              const SizedBox(height: 6),
                              Row(children: [
                                Expanded(
                                    child: Text(
                                        str(selected?['name'], 'Select a site'),
                                        style: Theme.of(context)
                                            .textTheme
                                            .headlineSmall
                                            ?.copyWith(
                                                fontWeight: FontWeight.w700))),
                                if (delta != null && delta.abs() >= .05)
                                  _DeltaPill(
                                      value: delta,
                                      unit: str(selected?['unit'], 'cm')),
                              ]),
                              const Divider(height: 26),
                              LayoutBuilder(builder: (context, b) {
                                final count = b.maxWidth >= 590 ? 3 : 1;
                                final width =
                                    (b.maxWidth - (count - 1) * 10) / count;
                                return Wrap(
                                    spacing: 10,
                                    runSpacing: 10,
                                    children: [
                                      _SiteStat(
                                          width: width,
                                          label: 'CURRENT SIZE',
                                          value: currentValue == null
                                              ? '—'
                                              : currentValue.toStringAsFixed(1),
                                          unit: str(selected?['unit'], 'cm')),
                                      _SiteStat(
                                          width: width,
                                          label: 'BASELINE SIZE',
                                          value: baselineValue == null
                                              ? '—'
                                              : baselineValue
                                                  .toStringAsFixed(1),
                                          unit: str(selected?['unit'], 'cm')),
                                      _SiteStat(
                                          width: width,
                                          label: 'TOTAL CHANGE',
                                          value: delta == null
                                              ? '—'
                                              : '${delta > 0 ? '+' : ''}${delta.toStringAsFixed(1)}',
                                          unit: str(selected?['unit'], 'cm'),
                                          accent: delta == null
                                              ? null
                                              : delta <= 0
                                                  ? Colors.teal
                                                  : Colors.orange),
                                    ]);
                              }),
                              const SizedBox(height: 22),
                              Text('Record a new measurement',
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleSmall
                                      ?.copyWith(fontWeight: FontWeight.w700)),
                              const SizedBox(height: 10),
                              Row(children: [
                                Expanded(
                                    child: TextField(
                                        controller: quickValue,
                                        keyboardType: const TextInputType
                                            .numberWithOptions(decimal: true),
                                        decoration: InputDecoration(
                                            labelText: 'Value',
                                            suffixText:
                                                str(selected?['unit'], 'cm')))),
                                const SizedBox(width: 10),
                                FilledButton.icon(
                                    onPressed: selected == null
                                        ? null
                                        : () => _saveQuick(selected!),
                                    icon: const Icon(Icons.check),
                                    label: const Text('Save')),
                              ]),
                              if (current != null) ...[
                                const SizedBox(height: 8),
                                Text(
                                    'Last recorded ${displayDate(current['recorded_at'])}',
                                    style:
                                        Theme.of(context).textTheme.bodySmall),
                              ],
                            ]));
                    if (box.maxWidth < 940) {
                      return Column(children: [
                        map,
                        const SizedBox(height: 14),
                        inspector
                      ]);
                    }
                    return Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(width: 320, child: map),
                          const SizedBox(width: 16),
                          Expanded(child: inspector),
                        ]);
                  }),
                  const SizedBox(height: 16),
                  SectionCard(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Row(children: [
                          Icon(Icons.insights_outlined,
                              color: Theme.of(context).colorScheme.primary),
                          const SizedBox(width: 9),
                          Expanded(
                              child: Text('Body composition',
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleLarge
                                      ?.copyWith(fontWeight: FontWeight.w700))),
                          Text('Estimates',
                              style: Theme.of(context).textTheme.labelMedium),
                        ]),
                        const SizedBox(height: 14),
                        LayoutBuilder(builder: (context, box) {
                          final count = box.maxWidth >= 800
                              ? 4
                              : box.maxWidth >= 500
                                  ? 2
                                  : 1;
                          final width =
                              (box.maxWidth - 10 * (count - 1)) / count;
                          return Wrap(spacing: 10, runSpacing: 10, children: [
                            _SiteStat(
                                width: width,
                                label: 'BODY MASS INDEX',
                                value: bmi['value'] == null
                                    ? '—'
                                    : numVal(bmi['value']).toStringAsFixed(1),
                                unit: str(bmi['category'], 'BMI')),
                            _SiteStat(
                                width: width,
                                label: 'BODY FAT',
                                value: fat['preferredValue'] == null
                                    ? '—'
                                    : numVal(fat['preferredValue'])
                                        .toStringAsFixed(1),
                                unit: '%'),
                            _SiteStat(
                                width: width,
                                label: 'LEAN MASS',
                                value: fat['leanMassKg'] == null
                                    ? '—'
                                    : numVal(fat['leanMassKg'])
                                        .toStringAsFixed(1),
                                unit: 'kg'),
                            _SiteStat(
                                width: width,
                                label: 'BASAL METABOLIC RATE',
                                value: asJson(comp['metabolism'])['bmr'] == null
                                    ? '—'
                                    : '${numVal(asJson(comp['metabolism'])['bmr']).round()}',
                                unit: 'kcal/day'),
                          ]);
                        }),
                        const SizedBox(height: 10),
                        Text(
                            'Body fat and BMI are estimates based on your profile and recorded measurements.',
                            style: Theme.of(context).textTheme.bodySmall),
                      ])),
                  if (asList(comp['bodyFatHistory']).isNotEmpty) ...[
                    const SizedBox(height: 16),
                    SectionCard(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text('Body fat trend',
                              style: Theme.of(context).textTheme.titleLarge),
                          const SizedBox(height: 12),
                          SizedBox(
                              height: 210,
                              child: WeightLineChart(
                                  entries: asList(comp['bodyFatHistory']),
                                  unit: '%')),
                        ])),
                  ],
                ] else if (view == 'zones') ...[
                  for (final zone in [
                    'Core & torso',
                    'Upper body',
                    'Lower body',
                    'Custom sites'
                  ])
                    Builder(builder: (context) {
                      final zoneDefs = definitions.where((definition) {
                        final slug = str(definition['slug']);
                        final custom = definition['is_system'] != 1 &&
                            definition['is_system'] != true;
                        if (zone == 'Custom sites') return custom;
                        if (custom) return false;
                        if (zone == 'Core & torso') {
                          return ['waist', 'hips', 'chest', 'neck', 'height']
                              .contains(slug);
                        }
                        if (zone == 'Upper body') {
                          return slug.contains('arm') ||
                              slug.contains('forearm');
                        }
                        return slug.contains('thigh') || slug.contains('calf');
                      }).toList();
                      if (zoneDefs.isEmpty) return const SizedBox.shrink();
                      return Padding(
                          padding: const EdgeInsets.only(bottom: 14),
                          child: SectionCard(
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                Text(zone,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleLarge
                                        ?.copyWith(
                                            fontWeight: FontWeight.w700)),
                                const SizedBox(height: 8),
                                for (final definition in zoneDefs)
                                  ListTile(
                                      contentPadding: EdgeInsets.zero,
                                      leading: Icon(Icons.straighten,
                                          color: Theme.of(context)
                                              .colorScheme
                                              .primary),
                                      title: Text(str(definition['name'])),
                                      subtitle: Text(latest[
                                                  str(definition['id'])] ==
                                              null
                                          ? 'No measurement yet'
                                          : '${numVal(latest[str(definition['id'])]!['value']).toStringAsFixed(1)} ${str(definition['unit'])} · ${displayDate(latest[str(definition['id'])]!['recorded_at'])}'),
                                      trailing: const Icon(Icons.chevron_right),
                                      onTap: () => setState(() {
                                            selectedId = str(definition['id']);
                                            view = 'studio';
                                          })),
                              ])));
                    }),
                ] else ...[
                  SectionCard(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        TextField(
                            onChanged: (value) =>
                                setState(() => historyQuery = value),
                            decoration: const InputDecoration(
                                prefixIcon: Icon(Icons.search),
                                hintText: 'Search measurement history')),
                        const SizedBox(height: 10),
                        if (entries.isEmpty)
                          emptyMessage(context, 'No measurements yet',
                              'Log your first measurement to start a timeline.'),
                        for (final entry in entries.where((entry) {
                          if (historyQuery.trim().isEmpty) return true;
                          final definition = definitions
                              .where((d) =>
                                  str(d['id']) == str(entry['definition_id']))
                              .firstOrNull;
                          return '${str(definition?['name'])} ${str(entry['value'])} ${displayDate(entry['recorded_at'])}'
                              .toLowerCase()
                              .contains(historyQuery.toLowerCase());
                        }))
                          Builder(builder: (context) {
                            final definition = definitions
                                .where((d) =>
                                    str(d['id']) == str(entry['definition_id']))
                                .firstOrNull;
                            return ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: const Icon(Icons.timeline),
                                title: Text(
                                    str(definition?['name'], 'Measurement')),
                                subtitle:
                                    Text(displayDate(entry['recorded_at'])),
                                trailing: Text(
                                    '${numVal(entry['value']).toStringAsFixed(1)} ${str(definition?['unit'])}'));
                          }),
                      ])),
                ],
              ]);
        });
      });
}

class _RatioInsightCard extends StatelessWidget {
  const _RatioInsightCard({
    required this.title,
    required this.abbreviation,
    required this.subtitle,
    required this.value,
    required this.category,
    required this.inputs,
    required this.icon,
    required this.isWaistHeight,
    required this.female,
  });
  final String title, abbreviation, subtitle, category, inputs;
  final double value;
  final IconData icon;
  final bool isWaistHeight, female;

  @override
  Widget build(BuildContext context) {
    final valid = value > 0;
    final threshold = isWaistHeight
        ? .5
        : female
            ? .85
            : .9;
    final high = isWaistHeight
        ? .6
        : female
            ? .9
            : 1.0;
    final color = !valid
        ? Theme.of(context).colorScheme.outline
        : value < threshold
            ? const Color(0xff2da77b)
            : value < high
                ? const Color(0xffd89a34)
                : const Color(0xffdf5366);
    final points =
        isWaistHeight ? const [.5, .25, .25] : const [1 / 3, 1 / 3, 1 / 3];
    final marker = (value / (isWaistHeight ? .8 : 1.2)).clamp(0.0, 1.0);
    return SectionCard(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                    color: color.withValues(alpha: .12),
                    borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: color, size: 20)),
            const SizedBox(width: 11),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('$title ($abbreviation)',
                      style: Theme.of(context)
                          .textTheme
                          .titleSmall
                          ?.copyWith(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
                ])),
            if (valid)
              Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                      color: color.withValues(alpha: .12),
                      borderRadius: BorderRadius.circular(20)),
                  child: Text(category,
                      style: TextStyle(
                          color: color,
                          fontSize: 11,
                          fontWeight: FontWeight.w700))),
          ]),
          const SizedBox(height: 18),
          Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text(valid ? value.toStringAsFixed(2) : '—',
                style: Theme.of(context)
                    .textTheme
                    .displaySmall
                    ?.copyWith(fontWeight: FontWeight.w800, height: 1)),
            const SizedBox(width: 10),
            Expanded(
                child: Padding(
                    padding: const EdgeInsets.only(bottom: 3),
                    child: Text(inputs,
                        style: Theme.of(context).textTheme.bodySmall,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis))),
            if (valid)
              Text('Target < ${threshold.toStringAsFixed(2)}',
                  style: Theme.of(context)
                      .textTheme
                      .labelSmall
                      ?.copyWith(color: color, fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 14),
          if (valid)
            LayoutBuilder(
                builder: (context, box) => SizedBox(
                    height: 10,
                    child: Stack(clipBehavior: Clip.none, children: [
                      Row(children: [
                        for (var i = 0; i < points.length; i++)
                          Expanded(
                              flex: (points[i] * 100).round(),
                              child: Container(
                                  decoration: BoxDecoration(
                                      color: [
                                        const Color(0xff229b73),
                                        const Color(0xffd49a34),
                                        const Color(0xffd94d62)
                                      ][i],
                                      borderRadius: BorderRadius.horizontal(
                                          left: i == 0
                                              ? const Radius.circular(8)
                                              : Radius.zero,
                                          right: i == points.length - 1
                                              ? const Radius.circular(8)
                                              : Radius.zero))))
                      ]),
                      Positioned(
                          left: (box.maxWidth * marker - 2)
                              .clamp(-1.0, box.maxWidth - 3),
                          top: -3,
                          child: Container(
                              width: 5,
                              height: 16,
                              decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(4),
                                  boxShadow: const [
                                    BoxShadow(
                                        color: Colors.black38, blurRadius: 3)
                                  ]))),
                    ])))
          else
            Text(
                'Add waist and ${isWaistHeight ? 'height' : 'hip'} measurements to calculate this ratio.',
                style: Theme.of(context).textTheme.bodySmall),
          if (valid) ...[
            const SizedBox(height: 6),
            Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: (isWaistHeight
                        ? const [
                            'Healthy < 0.50',
                            'Increased 0.50–0.59',
                            'High ≥ 0.60'
                          ]
                        : const ['Lower risk', 'Moderate', 'Elevated'])
                    .map((label) =>
                        Text(label, style: const TextStyle(fontSize: 10)))
                    .toList()),
          ],
        ]));
  }
}

class _SiteStat extends StatelessWidget {
  const _SiteStat(
      {required this.width,
      required this.label,
      required this.value,
      required this.unit,
      this.accent});
  final double width;
  final String label, value, unit;
  final Color? accent;
  @override
  Widget build(BuildContext context) => Container(
      width: width,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface.withValues(alpha: .68),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
              color: Theme.of(context)
                  .colorScheme
                  .outlineVariant
                  .withValues(alpha: .36))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w800,
                letterSpacing: .6),
            maxLines: 1,
            overflow: TextOverflow.ellipsis),
        const SizedBox(height: 5),
        Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Flexible(
                  child: Text(value,
                      style: Theme.of(context)
                          .textTheme
                          .headlineSmall
                          ?.copyWith(
                              color: accent, fontWeight: FontWeight.w800),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis)),
              const SizedBox(width: 5),
              Flexible(
                  child: Text(unit,
                      style: Theme.of(context).textTheme.bodySmall,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis)),
            ]),
      ]));
}

class _DeltaPill extends StatelessWidget {
  const _DeltaPill({required this.value, required this.unit});
  final double value;
  final String unit;
  @override
  Widget build(BuildContext context) {
    final color =
        value <= 0 ? const Color(0xff2da77b) : const Color(0xffd89a34);
    return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
            color: color.withValues(alpha: .12),
            borderRadius: BorderRadius.circular(20)),
        child: Text('${value > 0 ? '+' : ''}${value.toStringAsFixed(1)} $unit',
            style: TextStyle(
                color: color, fontWeight: FontWeight.w700, fontSize: 12)));
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});
  final Color color;
  final String label;
  @override
  Widget build(BuildContext context) =>
      Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 6),
        Text(label, style: Theme.of(context).textTheme.labelSmall),
      ]);
}

class MeasurementDetailScreen extends StatelessWidget {
  const MeasurementDetailScreen(
      {super.key, required this.api, required this.id});
  final ApiClient api;
  final String id;
  @override
  Widget build(BuildContext context) => FutureBuilder<List<dynamic>>(
      future: api.getList('/measurements/entries?definition_id=$id'),
      builder: (context, s) {
        if (s.hasError) return Center(child: Text(s.error.toString()));
        if (!s.hasData) return const Center(child: CircularProgressIndicator());
        final entries = s.data!;
        final first =
            entries.isEmpty ? <String, dynamic>{} : asJson(entries.last);
        final name = str(first['name'] ?? asJson(first['definition'])['name'],
            'Measurement history');
        return ListView(padding: const EdgeInsets.all(22), children: [
          PageHeading(name, subtitle: 'History and change over time.'),
          SectionCard(
              child: SizedBox(
                  height: 240,
                  child: WeightLineChart(
                      entries: entries.reversed.toList(),
                      unit: str(
                          first['unit'] ?? asJson(first['definition'])['unit'],
                          'cm')))),
          const SizedBox(height: 14),
          SectionCard(
              child: Column(children: [
            for (final raw in entries)
              Builder(builder: (context) {
                final e = asJson(raw);
                return ListTile(
                    title: Text(
                        '${numVal(e['value']).toStringAsFixed(1)} ${str(e['unit'])}'),
                    subtitle: Text(displayDate(e['recorded_at'])),
                    trailing: IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: () async {
                          if (await confirmAction(
                              context,
                              'Delete measurement?',
                              'This removes this entry.')) {
                            await api
                                .delete('/measurements/entries/${e['id']}');
                            if (context.mounted) context.go('/measurements');
                          }
                        }));
              })
          ]))
        ]);
      });
}
