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
      required this.onSelect});
  final List<dynamic> definitions;
  final Map<String, dynamic> latest;
  final ValueChanged<Json> onSelect;

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
                  )),
            )));
  }
}

class _BodyPainter extends CustomPainter {
  const _BodyPainter(
      {required this.color, required this.dot, required this.recorded});
  final Color color, dot;
  final Set<String> recorded;
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
      canvas.drawCircle(center, 8, Paint()..color = dot.withValues(alpha: .2));
      canvas.drawCircle(center, 4.2,
          Paint()..color = recorded.contains(point.slug) ? dot : Colors.white);
      canvas.drawCircle(
          center,
          4.2,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.5
            ..color = dot);
    }
  }

  @override
  bool shouldRepaint(covariant _BodyPainter old) =>
      old.color != color || old.dot != dot || old.recorded != recorded;
}

class MeasurementsScreen extends StatefulWidget {
  const MeasurementsScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<MeasurementsScreen> createState() => _MeasurementsScreenState();
}

class _MeasurementsScreenState extends State<MeasurementsScreen> {
  late Future<(List<dynamic>, List<dynamic>, Json)> _data;
  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => _data = Future.wait<dynamic>([
        widget.api.getList('/measurements/definitions'),
        widget.api.getList('/measurements/entries'),
        widget.api.getMap('/body-composition')
      ]).then((v) => (asList(v[0]), asList(v[1]), asJson(v[2])));

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
        final definitions = d.$1, entries = d.$2, composition = d.$3;
        final comp = composition;
        final bmi = asJson(comp['bmi']);
        final latest = {
          for (final e in entries) str(asJson(e)['definition_id']): asJson(e)
        };
        final ratios = asJson(composition['ratios']);
        final fat = asJson(composition['bodyFat']);
        return ListView(
            padding: const EdgeInsets.fromLTRB(20, 22, 20, 28),
            children: [
              PageHeading('Measurements studio',
                  subtitle: 'A complete timeline of your body measurements.',
                  trailing: PopupMenuButton<String>(
                      onSelected: (v) {
                        if (v == 'log') {
                          _log(definitions);
                        } else if (v == 'batch') {
                          _batchLog(definitions);
                        } else {
                          _addDefinition();
                        }
                      },
                      itemBuilder: (_) => const [
                            PopupMenuItem(
                                value: 'log', child: Text('Log a measurement')),
                            PopupMenuItem(
                                value: 'batch', child: Text('Log a batch')),
                            PopupMenuItem(
                                value: 'custom',
                                child: Text('Add custom location'))
                          ],
                      child: const Chip(
                          avatar: Icon(Icons.add, size: 18),
                          label: Text('Add')))),
              LayoutBuilder(builder: (context, box) {
                final width =
                    box.maxWidth < 560 ? box.maxWidth : (box.maxWidth - 24) / 3;
                return Wrap(spacing: 12, runSpacing: 12, children: [
                  SizedBox(
                      width: width,
                      child: MetricTile(
                          label: 'Waist / height',
                          value: ratios['whtr'] == null
                              ? '—'
                              : numVal(ratios['whtr']).toStringAsFixed(2),
                          detail: 'Ratio',
                          icon: Icons.straighten)),
                  SizedBox(
                      width: width,
                      child: MetricTile(
                          label: 'Waist / hips',
                          value: ratios['whr'] == null
                              ? '—'
                              : numVal(ratios['whr']).toStringAsFixed(2),
                          detail: 'Ratio',
                          icon: Icons.accessibility)),
                  SizedBox(
                      width: width,
                      child: MetricTile(
                          label: 'Body fat estimate',
                          value: fat['preferredValue'] == null
                              ? '—'
                              : '${numVal(fat['preferredValue']).toStringAsFixed(1)}%',
                          detail:
                              str(fat['category'], 'Needs more measurements'),
                          icon: Icons.pie_chart_outline)),
                ]);
              }),
              const SizedBox(height: 14),
              SectionCard(child: LayoutBuilder(builder: (context, box) {
                final body = _BodyMap(
                    definitions: definitions,
                    latest: latest,
                    onSelect: (d) => context.go('/measurements/${d['id']}'));
                if (box.maxWidth < 570) {
                  return Column(children: [
                    body,
                    Text('Tap a location to explore its history.',
                        style: Theme.of(context).textTheme.bodySmall)
                  ]);
                }
                return Row(children: [
                  body,
                  const SizedBox(width: 22),
                  Expanded(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                        Text('Body map',
                            style: Theme.of(context).textTheme.titleLarge),
                        const SizedBox(height: 8),
                        const Text(
                            'Tap a marked location to open its timeline. Filled points have recorded data; outlined points are ready for your first measurement.'),
                        const SizedBox(height: 12),
                        Text('${latest.length} locations with records',
                            style: Theme.of(context).textTheme.labelLarge)
                      ]))
                ]);
              })),
              const SizedBox(height: 14),
              SectionCard(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text('Body composition',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 10),
                    LayoutBuilder(builder: (context, box) {
                      final count = box.maxWidth >= 760
                          ? 4
                          : box.maxWidth >= 480
                              ? 2
                              : 1;
                      final width = (box.maxWidth - 12 * (count - 1)) / count;
                      return Wrap(spacing: 12, runSpacing: 12, children: [
                        SizedBox(
                            width: width,
                            child: MetricTile(
                                label: 'BMI',
                                value: bmi['value'] == null
                                    ? '—'
                                    : numVal(bmi['value']).toStringAsFixed(1),
                                detail: str(bmi['category']),
                                icon: Icons.accessibility)),
                        SizedBox(
                            width: width,
                            child: MetricTile(
                                label: 'Lean mass',
                                value: fat['leanMassKg'] == null
                                    ? '—'
                                    : '${numVal(fat['leanMassKg']).toStringAsFixed(1)} kg',
                                icon: Icons.fitness_center)),
                        SizedBox(
                            width: width,
                            child: MetricTile(
                                label: 'Fat mass',
                                value: fat['fatMassKg'] == null
                                    ? '—'
                                    : '${numVal(fat['fatMassKg']).toStringAsFixed(1)} kg',
                                icon: Icons.pie_chart_outline)),
                        SizedBox(
                            width: width,
                            child: MetricTile(
                                label: 'BMR',
                                value: asJson(comp['metabolism'])['bmr'] == null
                                    ? '—'
                                    : '${numVal(asJson(comp['metabolism'])['bmr']).round()} kcal/day',
                                detail: 'Mifflin–St Jeor estimate',
                                icon: Icons.local_fire_department_outlined)),
                      ]);
                    }),
                    const SizedBox(height: 10),
                    Text(
                        'Body fat is an estimate. Forma prefers the US Navy circumference method when the needed measurements are available; otherwise it uses the Deurenberg BMI estimate. BMI is weight divided by height squared.',
                        style: Theme.of(context).textTheme.bodySmall),
                  ])),
              const SizedBox(height: 14),
              if (asList(composition['bodyFatHistory']).isNotEmpty)
                SectionCard(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text('Body fat estimate history',
                          style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 12),
                      SizedBox(
                          height: 210,
                          child: WeightLineChart(
                              entries: asList(composition['bodyFatHistory']),
                              unit: '%')),
                    ])),
              if (asList(composition['bmiHistory']).isNotEmpty) ...[
                const SizedBox(height: 14),
                SectionCard(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text('BMI history',
                          style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 12),
                      SizedBox(
                          height: 210,
                          child: WeightLineChart(entries: [
                            for (final row in asList(composition['bmiHistory']))
                              {'value': asJson(row)['bmi']}
                          ], unit: 'BMI')),
                    ])),
              ],
              const SizedBox(height: 14),
              SectionCard(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text('Measurement locations',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 8),
                    for (final raw in definitions)
                      Builder(builder: (context) {
                        final def = asJson(raw), item = latest[str(def['id'])];
                        return ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(def['is_system'] == 1
                                ? Icons.accessibility_new
                                : Icons.add_circle_outline),
                            title: Text(str(def['name'])),
                            subtitle: Text(item == null
                                ? 'No record yet'
                                : '${numVal(item['value']).toStringAsFixed(1)} ${str(def['unit'])} · ${displayDate(item['recorded_at'])}'),
                            trailing:
                                Row(mainAxisSize: MainAxisSize.min, children: [
                              if (def['is_system'] != 1 &&
                                  def['is_system'] != true)
                                IconButton(
                                    tooltip: 'Delete custom location',
                                    icon: const Icon(Icons.delete_outline),
                                    onPressed: () async {
                                      if (await confirmAction(
                                          context,
                                          'Delete ${str(def['name'])}?',
                                          'Historical entries for this location will also be deleted.')) {
                                        try {
                                          await widget.api.delete(
                                              '/measurements/definitions/${def['id']}');
                                          if (mounted) setState(_load);
                                        } catch (e) {
                                          if (context.mounted) {
                                            await showFormaError(context, e);
                                          }
                                        }
                                      }
                                    }),
                              const Icon(Icons.chevron_right),
                            ]),
                            onTap: () =>
                                context.go('/measurements/${def['id']}'));
                      }),
                  ])),
              const SizedBox(height: 14),
              SectionCard(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                    Text('Recent entries',
                        style: Theme.of(context).textTheme.titleLarge),
                    if (entries.isEmpty)
                      emptyMessage(context, 'No measurements yet',
                          'Log a few measurements to unlock body composition insights.'),
                    for (final raw in entries.take(12))
                      Builder(builder: (context) {
                        final e = asJson(raw);
                        return ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            title: Text(str(
                                e['name'] ?? asJson(e['definition'])['name'])),
                            subtitle: Text(displayDate(e['recorded_at'])),
                            trailing: Text(
                                '${numVal(e['value']).toStringAsFixed(1)} ${str(e['unit'] ?? asJson(e['definition'])['unit'])}'));
                      })
                  ])),
            ]);
      });
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
