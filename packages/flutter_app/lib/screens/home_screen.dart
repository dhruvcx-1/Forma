import 'dart:async';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../data/api_client.dart';
import '../widgets/forma_widgets.dart';
import 'record_screens.dart' show WeightLineChart;
import 'shared.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late Future<List<dynamic>> data;
  String historyRange = '30D';
  String compositionRange = '90D';
  String compositionMode = 'BMI';

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final now = DateTime.now();
    final date =
        '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    data = Future.wait<dynamic>([
      _quiet(widget.api.getMap('/weight/stats'), <String, dynamic>{}),
      _quiet(widget.api.getMap('/weight?limit=500&paginate=true'),
          <String, dynamic>{}),
      _quiet(widget.api.getMap('/body-composition'), <String, dynamic>{}),
      _quiet(widget.api.getMap('/goals'), <String, dynamic>{}),
      _quiet(widget.api.getMap('/nutrition/plan'), <String, dynamic>{}),
      _quiet(widget.api.getMap('/fasting/active'), <String, dynamic>{}),
      _quiet(widget.api.getMap('/settings'), <String, dynamic>{}),
      _quiet(widget.api.getList('/measurements/entries'), <dynamic>[]),
      _quiet(widget.api.getMap('/fasting/history'), <String, dynamic>{}),
      _quiet(
          widget.api.getMap('/nutrition/logs?date=$date'), <String, dynamic>{}),
    ]);
  }

  Future<T> _quiet<T>(Future<T> request, T fallback) async {
    try {
      return await request;
    } catch (_) {
      return fallback;
    }
  }

  @override
  Widget build(BuildContext context) => AsyncContent<List<dynamic>>(
        future: data,
        onRetry: () => setState(_load),
        builder: (context, d) {
          final stats = asJson(d[0]);
          final weightPage = asJson(d[1]);
          final weights = asList(weightPage['entries']);
          final totalWeightEntries =
              numVal(weightPage['total'], weights.length.toDouble()).round();
          final comp = asJson(d[2]);
          final goal = asJson(d[3]);
          final nutrition = asJson(d[4]);
          final fasting = asJson(d[5]);
          final settings = asJson(d[6]);
          final measurements = asList(d[7]);
          final fastingStats = asJson(asJson(d[8])['stats']);
          final todayLog = asJson(asJson(d[9])['log']);
          final unitSystem = str(settings['unit_system'], 'metric');
          final weightUnit = unitSystem == 'imperial' ? 'lb' : 'kg';
          final lengthUnit = unitSystem == 'imperial' ? 'in' : 'cm';
          double weightValue(dynamic kg) {
            final value = numVal(kg);
            return unitSystem == 'imperial' ? value * 2.20462 : value;
          }

          final current = asJson(stats['currentWeight']);
          final latestKg = numVal(current['value'], double.nan);
          final sortedWeights = [...weights]
            ..sort((a, b) => _dateOf(b).compareTo(_dateOf(a)));
          final latestDate =
              sortedWeights.isEmpty ? null : _dateOf(sortedWeights.first);
          final change7 = _changeSince(sortedWeights, latestKg, 7);
          final change30 = _changeSince(sortedWeights, latestKg, 30);

          final goalTargetRaw =
              numVal(goal['target_weight'] ?? goal['targetWeight'], double.nan);
          final goalTarget = goalTargetRaw.isNaN
              ? double.nan
              : _weightToKg(
                  goalTargetRaw, str(goal['target_weight_unit'], 'kg'));
          final goalStartRaw =
              numVal(goal['starting_weight'] ?? goal['startWeight'], latestKg);
          final goalStart = _weightToKg(
              goalStartRaw, str(goal['starting_weight_unit'], 'kg'));
          final goalProgress = goalTarget.isNaN || latestKg.isNaN
              ? null
              : _progress(goalStart, goalTarget, latestKg);

          final waist = _waistEntries(measurements);
          final latestWaist = waist.isEmpty ? null : waist.first;
          final previousWaist = waist.length < 2 ? null : waist[1];
          final latestWaistValue =
              latestWaist == null ? null : numVal(latestWaist['value']);
          final previousWaistValue =
              previousWaist == null ? null : numVal(previousWaist['value']);
          final streak = _streak(sortedWeights);
          final createdDate =
              sortedWeights.isEmpty ? null : _dateOf(sortedWeights.last);

          final bmi = asJson(comp['bmi']);
          final bodyFat = asJson(comp['bodyFat']);
          final metabolism = asJson(comp['metabolism']);
          final ratios = asJson(comp['ratios']);
          final available = asJson(comp['availableData']);
          final bmiHistory = asList(comp['bmiHistory']);
          final bodyFatHistory = asList(comp['bodyFatHistory']);

          final plan = asJson(nutrition['plan']);
          final calculated = asJson(nutrition['calculated']);
          final activeFast = asJson(fasting['activeFast']);
          final width = MediaQuery.sizeOf(context).width;
          final wide = width >= 950;
          final chartValues = compositionMode == 'BMI'
              ? bmiHistory
                  .map((e) => _ChartPoint(_dateOf(e), numVal(asJson(e)['bmi']),
                      category: str(asJson(e)['category'], '')))
                  .toList()
              : bodyFatHistory
                  .map((e) => _ChartPoint(
                      _dateOf(e), numVal(asJson(e)['value']),
                      category: str(asJson(e)['method'], '')))
                  .toList();
          final compositionPoints =
              _filterPoints(chartValues, compositionRange);
          final weightPoints = _filterWeights(sortedWeights, historyRange);
          final displayWeightEntries = weightPoints
              .map((entry) => {
                    ...asJson(entry),
                    'weight': weightValue(asJson(entry)['weight']),
                  })
              .toList()
              .reversed
              .toList();

          return ListView(
            padding:
                EdgeInsets.fromLTRB(wide ? 30 : 16, 18, wide ? 30 : 16, 30),
            children: [
              PageHeading(
                'Dashboard',
                subtitle: 'Your progress, health metrics and daily habits.',
                trailing: IconButton.filledTonal(
                  tooltip: 'Refresh dashboard',
                  onPressed: () => setState(_load),
                  icon: const Icon(Icons.refresh),
                ),
              ),
              LayoutBuilder(builder: (context, constraints) {
                final columns = constraints.maxWidth >= 700 ? 3 : 2;
                return GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: columns,
                  mainAxisExtent: 132,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  children: [
                    _DashboardStat(
                      title: 'Current weight',
                      value: latestKg.isNaN
                          ? '—'
                          : '${weightValue(latestKg).toStringAsFixed(1)} $weightUnit',
                      detail: latestDate == null
                          ? 'Log your first entry'
                          : 'As of ${_shortDate(latestDate)}',
                      icon: Icons.monitor_weight_outlined,
                      trailing: _MiniSparkline(
                          values: sortedWeights.reversed
                              .take(8)
                              .map((e) => numVal(asJson(e)['weight']))
                              .toList()),
                    ),
                    _DashboardStat(
                      title: 'Weight change',
                      value: change7 == null
                          ? '—'
                          : '${change7 <= 0 ? '' : '+'}${weightValue(change7).toStringAsFixed(1)} $weightUnit',
                      detail: change7 == null
                          ? 'Add more entries to compare'
                          : '7D ${_signed(weightValue(change7))} · 30D ${change30 == null ? '—' : _signed(weightValue(change30))} $weightUnit',
                      icon: change7 == null || change7 == 0
                          ? Icons.trending_flat
                          : change7 < 0
                              ? Icons.trending_down
                              : Icons.trending_up,
                      accent: change7 == null || change7 <= 0
                          ? const Color(0xff18b47b)
                          : Theme.of(context).colorScheme.error,
                    ),
                    _DashboardStat(
                      title: 'Goal progress',
                      value: goalProgress == null
                          ? 'Set a goal'
                          : '${goalProgress.percent.round()}%',
                      detail: goalProgress == null
                          ? 'Choose a target weight'
                          : '${weightValue(goalProgress.remaining).toStringAsFixed(1)} $weightUnit remaining',
                      icon: Icons.track_changes_outlined,
                      progress: goalProgress?.percent,
                    ),
                    _DashboardStat(
                      title: 'Waist',
                      value: latestWaistValue == null
                          ? '—'
                          : '${_lengthValue(latestWaistValue, unitSystem).toStringAsFixed(1)} $lengthUnit',
                      detail: latestWaistValue == null ||
                              previousWaistValue == null
                          ? 'Latest circumference'
                          : 'Latest · ${_signed(_lengthValue(latestWaistValue - previousWaistValue, unitSystem))} $lengthUnit since prior',
                      icon: Icons.straighten_outlined,
                      accent:
                          latestWaistValue == null || previousWaistValue == null
                              ? null
                              : latestWaistValue <= previousWaistValue
                                  ? const Color(0xff18b47b)
                                  : Theme.of(context).colorScheme.error,
                    ),
                    _DashboardStat(
                      title: 'Log streak',
                      value: '$streak ${streak == 1 ? 'day' : 'days'}',
                      detail: streak == 0
                          ? 'Log today to start a streak'
                          : 'Consecutive days with entries',
                      icon: Icons.local_fire_department_outlined,
                      accent: const Color(0xffffa31a),
                    ),
                    _DashboardStat(
                      title: 'Weight entries',
                      value: '$totalWeightEntries',
                      detail: createdDate == null
                          ? 'Your tracking history'
                          : 'Since ${_shortDate(createdDate)}',
                      icon: Icons.monitor_heart_outlined,
                    ),
                  ],
                );
              }),
              const SizedBox(height: 18),

              // BMI and body fat context are the high value health insights
              // from the original dashboard, with the formulas' inputs visible.
              LayoutBuilder(builder: (context, constraints) {
                final columns = constraints.maxWidth >= 680 ? 2 : 1;
                final cardWidth =
                    (constraints.maxWidth - (columns - 1) * 14) / columns;
                final heightCm = numVal(available['heightCm']);
                final bmiRange = asJson(bmi['healthyWeightRangeKg']);
                final healthyMin = numVal(bmiRange['minKg']);
                final healthyMax = numVal(bmiRange['maxKg']);
                final leanKg = numVal(bodyFat['leanMassKg'], double.nan);
                final fatKg = numVal(bodyFat['fatMassKg'], double.nan);
                final fatPct = numVal(bodyFat['preferredValue'], double.nan);
                return Wrap(spacing: 14, runSpacing: 14, children: [
                  SizedBox(
                    width: cardWidth,
                    child: _HealthInsightCard(
                      icon: Icons.accessibility_new,
                      title: 'Body mass index',
                      tag: heightCm > 0
                          ? 'Height ${_heightLabel(heightCm, unitSystem)}'
                          : null,
                      value: bmi['value'] == null
                          ? '—'
                          : numVal(bmi['value']).toStringAsFixed(1),
                      status: str(bmi['category'], 'Add height and weight'),
                      accent: _bmiColor(context, str(bmi['category'], '')),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (bmi['value'] != null)
                              _BmiRangeBar(value: numVal(bmi['value'])),
                            if (bmi['change30d'] != null) ...[
                              const SizedBox(height: 5),
                              Text(
                                  '30-day change · ${_signed(numVal(bmi['change30d']))} BMI points',
                                  style: Theme.of(context)
                                      .textTheme
                                      .labelSmall
                                      ?.copyWith(
                                          color: numVal(bmi['change30d']) <= 0
                                              ? const Color(0xff18b47b)
                                              : Theme.of(context)
                                                  .colorScheme
                                                  .error,
                                          fontWeight: FontWeight.w600)),
                            ],
                            const SizedBox(height: 12),
                            if (healthyMin > 0 && healthyMax > 0)
                              _InsightNote(
                                icon: Icons.info_outline,
                                text:
                                    'Healthy weight range for your height: ${weightValue(healthyMin).toStringAsFixed(1)}–${weightValue(healthyMax).toStringAsFixed(1)} $weightUnit',
                                detail: numVal(bmi['distanceToNormalKg']) == 0
                                    ? 'Within the BMI reference range'
                                    : '${weightValue(numVal(bmi['distanceToNormalKg'])).abs().toStringAsFixed(1)} $weightUnit to the reference range',
                              )
                            else
                              const _InsightNote(
                                icon: Icons.tips_and_updates_outlined,
                                text:
                                    'Add height in Settings to unlock your BMI range.',
                              ),
                          ]),
                    ),
                  ),
                  SizedBox(
                    width: cardWidth,
                    child: _HealthInsightCard(
                      icon: Icons.pie_chart_outline,
                      title: 'Body fat estimate',
                      tag: bodyFat['navy'] != null
                          ? 'US Navy method'
                          : 'BMI estimate',
                      value:
                          fatPct.isNaN ? '—' : '${fatPct.toStringAsFixed(1)}%',
                      status: str(bodyFat['category'], 'Add measurements'),
                      accent: const Color(0xff18b47b),
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (!leanKg.isNaN && !fatKg.isNaN) ...[
                              Row(children: [
                                Expanded(
                                    child: Text(
                                        'Lean ${weightValue(leanKg).toStringAsFixed(1)} $weightUnit',
                                        style: Theme.of(context)
                                            .textTheme
                                            .labelMedium
                                            ?.copyWith(
                                                color:
                                                    const Color(0xff18b47b)))),
                                Text(
                                    'Fat ${weightValue(fatKg).toStringAsFixed(1)} $weightUnit',
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelMedium
                                        ?.copyWith(
                                            color: const Color(0xffffa31a))),
                              ]),
                              const SizedBox(height: 8),
                              _CompositionBar(lean: leanKg, fat: fatKg),
                              const SizedBox(height: 12),
                            ],
                            _InsightNote(
                              icon: Icons.calculate_outlined,
                              text: bodyFat['navy'] != null
                                  ? 'Estimated from waist, neck${str(available['sex'], '') == 'female' ? ', hips' : ''} and height.'
                                  : 'Add waist and neck measurements for the US Navy estimate.',
                            ),
                          ]),
                    ),
                  ),
                ]);
              }),
              const SizedBox(height: 18),
              SectionCard(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 12),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          runSpacing: 10,
                          children: [
                            SegmentedButton<String>(
                              segments: const [
                                ButtonSegment(
                                    value: 'BMI', label: Text('BMI history')),
                                ButtonSegment(
                                    value: 'Body fat',
                                    label: Text('Body fat %')),
                              ],
                              selected: {compositionMode},
                              showSelectedIcon: false,
                              onSelectionChanged: (v) =>
                                  setState(() => compositionMode = v.first),
                            ),
                            Wrap(spacing: 4, children: [
                              for (final range in ['30D', '90D', '1Y', 'ALL'])
                                _RangeButton(
                                  label: range,
                                  selected: compositionRange == range,
                                  onTap: () =>
                                      setState(() => compositionRange = range),
                                ),
                            ]),
                          ]),
                      const SizedBox(height: 12),
                      SizedBox(
                        height: 250,
                        child: _DashboardLineChart(
                          points: compositionPoints,
                          unit: compositionMode == 'BMI' ? '' : '%',
                          emptyTitle: compositionMode == 'BMI'
                              ? 'BMI history will appear here'
                              : 'Body fat history will appear here',
                          emptyDetail:
                              'Log weight and measurements to build a trend.',
                        ),
                      ),
                    ]),
              ),
              const SizedBox(height: 14),

              MetricGrid(children: [
                _AdvancedMetric(
                  title: 'Waist-to-height',
                  value: _ratioValue(ratios['whtr']),
                  unit: 'WHtR',
                  detail: _ratioDetail(ratios['whtr'], 'Log waist measurement'),
                  icon: Icons.straighten_outlined,
                  accent: _riskColor(context, _ratioCategory(ratios['whtr'])),
                ),
                _AdvancedMetric(
                  title: 'Waist-to-hip',
                  value: _ratioValue(ratios['whr']),
                  unit: 'WHR',
                  detail: _ratioDetail(
                      ratios['whr'], 'Log waist and hip measurements'),
                  icon: Icons.monitor_heart_outlined,
                  accent: _riskColor(context, _ratioCategory(ratios['whr'])),
                ),
                _AdvancedMetric(
                  title: 'Basal metabolic rate',
                  value: metabolism['bmr'] == null
                      ? '—'
                      : numVal(metabolism['bmr']).round().toString(),
                  unit: metabolism['bmr'] == null ? '' : 'kcal/day',
                  detail: metabolism['tdee'] == null
                      ? 'Requires weight and height'
                      : 'Sedentary TDEE · ${numVal(asJson(metabolism['tdee'])['sedentary']).round()} kcal',
                  icon: Icons.local_fire_department_outlined,
                  accent: const Color(0xffffa31a),
                ),
                _AdvancedMetric(
                  title: 'Total body water',
                  value: metabolism['waterLiters'] == null
                      ? '—'
                      : unitSystem == 'imperial'
                          ? (numVal(metabolism['waterLiters']) * .264172)
                              .toStringAsFixed(1)
                          : numVal(metabolism['waterLiters'])
                              .toStringAsFixed(1),
                  unit: metabolism['waterLiters'] == null
                      ? ''
                      : unitSystem == 'imperial'
                          ? 'gal'
                          : 'L',
                  detail: metabolism['waterLiters'] == null
                      ? 'Requires weight and height'
                      : 'Watson clinical estimate',
                  icon: Icons.water_drop_outlined,
                  accent: const Color(0xff32b6ef),
                ),
              ]),
              const SizedBox(height: 18),

              LayoutBuilder(builder: (context, constraints) {
                final columns = constraints.maxWidth >= 700 ? 2 : 1;
                final cardWidth =
                    (constraints.maxWidth - (columns - 1) * 14) / columns;
                return Wrap(spacing: 14, runSpacing: 14, children: [
                  SizedBox(
                    width: cardWidth,
                    child: _FastingDashboardCard(
                        activeFast: activeFast, stats: fastingStats),
                  ),
                  SizedBox(
                    width: cardWidth,
                    child: _NutritionDashboardCard(
                      plan: plan,
                      calculated: calculated,
                      logged: todayLog,
                    ),
                  ),
                ]);
              }),
              const SizedBox(height: 18),

              SectionCard(
                padding: const EdgeInsets.fromLTRB(18, 16, 18, 14),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Expanded(
                            child: Text('Weight history',
                                style: Theme.of(context)
                                    .textTheme
                                    .titleLarge
                                    ?.copyWith(fontWeight: FontWeight.w700))),
                        FilledButton.tonalIcon(
                          onPressed: () => context.go('/weight'),
                          icon: const Icon(Icons.add, size: 18),
                          label: const Text('Log'),
                        ),
                      ]),
                      const SizedBox(height: 8),
                      Row(children: [
                        Expanded(
                            child: Wrap(spacing: 4, children: [
                          for (final range in [
                            '7D',
                            '30D',
                            '90D',
                            '6M',
                            '1Y',
                            'ALL'
                          ])
                            _RangeButton(
                              label: range,
                              selected: historyRange == range,
                              onTap: () => setState(() => historyRange = range),
                            ),
                        ])),
                        Text('${weightPoints.length} entries',
                            style: Theme.of(context)
                                .textTheme
                                .labelMedium
                                ?.copyWith(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant)),
                      ]),
                      const SizedBox(height: 8),
                      SizedBox(
                        height: 245,
                        child: WeightLineChart(
                          entries: displayWeightEntries,
                          unit: weightUnit,
                        ),
                      ),
                    ]),
              ),
              if (sortedWeights.isNotEmpty) ...[
                const SizedBox(height: 18),
                SectionCard(
                  padding: const EdgeInsets.fromLTRB(18, 14, 12, 8),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Expanded(
                              child: Text('Recent entries',
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleLarge
                                      ?.copyWith(fontWeight: FontWeight.w700))),
                          TextButton.icon(
                            onPressed: () => context.go('/weight'),
                            iconAlignment: IconAlignment.end,
                            icon: const Icon(Icons.arrow_forward, size: 17),
                            label: const Text('View all'),
                          ),
                        ]),
                        for (var i = 0; i < sortedWeights.take(5).length; i++)
                          _RecentWeightEntry(
                            entry: asJson(sortedWeights[i]),
                            previous: i + 1 < sortedWeights.length
                                ? asJson(sortedWeights[i + 1])
                                : null,
                            unit: weightUnit,
                            displayValue: weightValue,
                          ),
                      ]),
                ),
              ],
              const SizedBox(height: 10),
              Wrap(spacing: 8, runSpacing: 8, children: [
                _QuickAction(
                    'Log weight', Icons.add, () => context.go('/weight')),
                _QuickAction('Measurements', Icons.straighten,
                    () => context.go('/measurements')),
                _QuickAction('Photos', Icons.photo_camera_outlined,
                    () => context.go('/photos')),
                _QuickAction('Set a goal', Icons.flag_outlined,
                    () => context.go('/goals')),
              ]),
            ],
          );
        },
      );
}

class _DashboardStat extends StatelessWidget {
  const _DashboardStat({
    required this.title,
    required this.value,
    required this.detail,
    required this.icon,
    this.accent,
    this.progress,
    this.trailing,
  });
  final String title, value, detail;
  final IconData icon;
  final Color? accent;
  final double? progress;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final color = accent ?? Theme.of(context).colorScheme.primary;
    return SectionCard(
      padding: const EdgeInsets.all(14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
              child: Text(title.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      letterSpacing: .65,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                      fontWeight: FontWeight.w700))),
          Icon(icon, size: 17, color: color),
        ]),
        const SizedBox(height: 7),
        Row(children: [
          Expanded(
              child: FittedBox(
                  alignment: Alignment.centerLeft,
                  fit: BoxFit.scaleDown,
                  child: Text(value,
                      maxLines: 1,
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          color:
                              accent ?? Theme.of(context).colorScheme.onSurface,
                          letterSpacing: -.4)))),
          if (trailing != null) ...[const SizedBox(width: 8), trailing!],
        ]),
        const SizedBox(height: 3),
        if (progress != null) ...[
          ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                  value: (progress! / 100).clamp(0.0, 1.0).toDouble(),
                  minHeight: 5)),
          const SizedBox(height: 6),
        ],
        Text(detail,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                fontSize: 11,
                color: Theme.of(context).colorScheme.onSurfaceVariant)),
      ]),
    );
  }
}

class _MiniSparkline extends StatelessWidget {
  const _MiniSparkline({required this.values});
  final List<double> values;
  @override
  Widget build(BuildContext context) {
    if (values.length < 2) return const SizedBox(width: 40);
    final low = values.reduce((a, b) => a < b ? a : b);
    final high = values.reduce((a, b) => a > b ? a : b);
    final pad = high == low ? 1.0 : (high - low) * .2;
    return SizedBox(
      width: 48,
      height: 26,
      child: LineChart(LineChartData(
        minY: low - pad,
        maxY: high + pad,
        minX: 0,
        maxX: (values.length - 1).toDouble(),
        titlesData: const FlTitlesData(show: false),
        gridData: const FlGridData(show: false),
        borderData: FlBorderData(show: false),
        lineTouchData: const LineTouchData(enabled: false),
        lineBarsData: [
          LineChartBarData(
            spots: [
              for (var i = 0; i < values.length; i++)
                FlSpot(i.toDouble(), values[i])
            ],
            isCurved: true,
            barWidth: 2,
            color: Theme.of(context).colorScheme.primary,
            dotData: const FlDotData(show: false),
          )
        ],
      )),
    );
  }
}

class _HealthInsightCard extends StatelessWidget {
  const _HealthInsightCard({
    required this.icon,
    required this.title,
    required this.value,
    required this.status,
    required this.accent,
    required this.child,
    this.tag,
  });
  final IconData icon;
  final String title, value, status;
  final Color accent;
  final Widget child;
  final String? tag;

  @override
  Widget build(BuildContext context) => SectionCard(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(icon, color: Theme.of(context).colorScheme.primary, size: 19),
            const SizedBox(width: 8),
            Expanded(
                child: Text(title.toUpperCase(),
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        letterSpacing: .55,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w700))),
            if (tag != null)
              Flexible(
                  child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 9, vertical: 5),
                      decoration: BoxDecoration(
                          color: Theme.of(context)
                              .colorScheme
                              .surfaceContainerHighest,
                          borderRadius: BorderRadius.circular(99)),
                      child: Text(tag!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.labelSmall))),
          ]),
          const SizedBox(height: 12),
          Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 9,
              runSpacing: 6,
              children: [
                Text(value,
                    style: Theme.of(context).textTheme.displaySmall?.copyWith(
                        fontWeight: FontWeight.w800, letterSpacing: -1.1)),
                Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                        color: accent.withValues(alpha: .12),
                        borderRadius: BorderRadius.circular(99)),
                    child: Text(status,
                        style: Theme.of(context)
                            .textTheme
                            .labelMedium
                            ?.copyWith(
                                color: accent, fontWeight: FontWeight.w700))),
              ]),
          const SizedBox(height: 14),
          child,
        ]),
      );
}

class _InsightNote extends StatelessWidget {
  const _InsightNote({required this.icon, required this.text, this.detail});
  final IconData icon;
  final String text;
  final String? detail;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            color: Theme.of(context)
                .colorScheme
                .surfaceContainerHighest
                .withValues(alpha: .55),
            borderRadius: BorderRadius.circular(14)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 17, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 9),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(text,
                    style: Theme.of(context)
                        .textTheme
                        .bodySmall
                        ?.copyWith(fontWeight: FontWeight.w600)),
                if (detail != null) ...[
                  const SizedBox(height: 4),
                  Text(detail!,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Theme.of(context).colorScheme.primary,
                          fontWeight: FontWeight.w600))
                ],
              ])),
        ]),
      );
}

class _BmiRangeBar extends StatelessWidget {
  const _BmiRangeBar({required this.value});
  final double value;
  @override
  Widget build(BuildContext context) {
    final position = ((value - 15) / 25).clamp(0.0, 1.0).toDouble();
    return SizedBox(
        height: 36,
        child: LayoutBuilder(
            builder: (context, box) =>
                Stack(alignment: Alignment.centerLeft, children: [
                  ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: Row(children: [
                        for (final segment in [
                          (0.14, const Color(0xff42a5f5)),
                          (0.256, const Color(0xff24a777)),
                          (0.20, const Color(0xffffb020)),
                          (0.404, const Color(0xffd84a68)),
                        ])
                          Expanded(
                              flex: (segment.$1 * 1000).round(),
                              child: Container(height: 9, color: segment.$2)),
                      ])),
                  Positioned(
                      left: (box.maxWidth - 12) * position,
                      child: Container(
                          width: 12,
                          height: 20,
                          decoration: BoxDecoration(
                              color: Theme.of(context).colorScheme.onSurface,
                              borderRadius: BorderRadius.circular(99),
                              border: Border.all(
                                  color: Theme.of(context).colorScheme.surface,
                                  width: 2)))),
                  const Positioned(
                      left: 0,
                      bottom: 0,
                      child: Text('18.5', style: TextStyle(fontSize: 10))),
                  const Positioned(
                      left: 36,
                      bottom: 0,
                      child: Text('25', style: TextStyle(fontSize: 10))),
                  const Positioned(
                      right: 0,
                      bottom: 0,
                      child: Text('40+', style: TextStyle(fontSize: 10))),
                ])));
  }
}

class _CompositionBar extends StatelessWidget {
  const _CompositionBar({required this.lean, required this.fat});
  final double lean, fat;
  @override
  Widget build(BuildContext context) {
    final total = lean + fat;
    final leanFraction =
        total <= 0 ? .5 : (lean / total).clamp(0.0, 1.0).toDouble();
    return ClipRRect(
        borderRadius: BorderRadius.circular(99),
        child: SizedBox(
            height: 8,
            child: Row(children: [
              Flexible(
                  flex: (leanFraction * 1000).round().clamp(1, 999).toInt(),
                  child: Container(color: const Color(0xff18b47b))),
              Flexible(
                  flex:
                      ((1 - leanFraction) * 1000).round().clamp(1, 999).toInt(),
                  child: Container(color: const Color(0xffffa31a))),
            ])));
  }
}

class _AdvancedMetric extends StatelessWidget {
  const _AdvancedMetric(
      {required this.title,
      required this.value,
      required this.unit,
      required this.detail,
      required this.icon,
      this.accent});
  final String title, value, unit, detail;
  final IconData icon;
  final Color? accent;
  @override
  Widget build(BuildContext context) => SectionCard(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
                child: Text(title.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        letterSpacing: .45,
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.w700))),
            Icon(icon,
                size: 17,
                color: accent ?? Theme.of(context).colorScheme.primary)
          ]),
          const SizedBox(height: 10),
          Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Flexible(
                    child: FittedBox(
                        alignment: Alignment.centerLeft,
                        fit: BoxFit.scaleDown,
                        child: Text(value,
                            style: Theme.of(context)
                                .textTheme
                                .titleLarge
                                ?.copyWith(fontWeight: FontWeight.w800)))),
                if (unit.isNotEmpty) ...[
                  const SizedBox(width: 5),
                  Flexible(
                      child: Text(unit,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall
                              ?.copyWith(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant)))
                ],
              ]),
          const SizedBox(height: 4),
          Text(detail,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(fontSize: 10.5)),
        ]),
      );
}

class _FastingDashboardCard extends StatefulWidget {
  const _FastingDashboardCard({required this.activeFast, required this.stats});
  final Json activeFast;
  final Json stats;
  @override
  State<_FastingDashboardCard> createState() => _FastingDashboardCardState();
}

class _FastingDashboardCardState extends State<_FastingDashboardCard> {
  Timer? _timer;
  DateTime now = DateTime.now();
  @override
  void initState() {
    super.initState();
    if (widget.activeFast.isNotEmpty) {
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() => now = DateTime.now());
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final active = widget.activeFast;
    final started = DateTime.tryParse(str(active['started_at'], ''));
    final target = numVal(active['target_duration_hours'], 16);
    final elapsed =
        started == null ? 0.0 : now.difference(started).inSeconds / 3600;
    final progress =
        target <= 0 ? 0.0 : (elapsed / target).clamp(0.0, 1.0).toDouble();
    final seconds = started == null
        ? 0
        : now.difference(started).inSeconds.clamp(0, 99999999);
    final timer =
        '${(seconds ~/ 3600).toString().padLeft(2, '0')}:${((seconds % 3600) ~/ 60).toString().padLeft(2, '0')}:${(seconds % 60).toString().padLeft(2, '0')}';
    final stage = elapsed < 4
        ? 'Fed state'
        : elapsed < 8
            ? 'Post-absorptive'
            : elapsed < 12
                ? 'Early fat burning'
                : elapsed < 16
                    ? 'Metabolic switch'
                    : elapsed < 24
                        ? 'Deep ketosis'
                        : 'Extended fast';
    return SectionCard(
        padding: const EdgeInsets.all(17),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            _IconBadge(
                icon: Icons.timer_outlined,
                color: Theme.of(context).colorScheme.primary),
            const SizedBox(width: 10),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Fasting window',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700)),
                  Text(
                      active.isEmpty
                          ? 'Ready when you are'
                          : '${str(active['fast_type'], 'Timed')} fast',
                      style: Theme.of(context).textTheme.bodySmall)
                ])),
            if (active.isNotEmpty)
              _StatusPill(text: stage, color: const Color(0xffffa31a)),
          ]),
          const SizedBox(height: 18),
          if (active.isNotEmpty) ...[
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(
                  child: Text(timer,
                      style: Theme.of(context)
                          .textTheme
                          .headlineMedium
                          ?.copyWith(
                              fontWeight: FontWeight.w800,
                              fontFeatures: const [
                            FontFeature.tabularFigures()
                          ]))),
              Text('${(progress * 100).round()}% of ${target.round()}h',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant))
            ]),
            const SizedBox(height: 10),
            LinearProgressIndicator(
                value: progress,
                minHeight: 7,
                borderRadius: BorderRadius.circular(99),
                color: const Color(0xffffb31a)),
            const SizedBox(height: 12),
            Align(
                alignment: Alignment.centerRight,
                child: TextButton.icon(
                    onPressed: () => context.go('/fasting'),
                    iconAlignment: IconAlignment.end,
                    icon: const Icon(Icons.arrow_forward, size: 16),
                    label: const Text('Fasting stages'))),
          ] else ...[
            Text(
                'No active fast. Start a scheduled fast to track your time and stages.',
                style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 10),
            Align(
                alignment: Alignment.centerRight,
                child: FilledButton.tonalIcon(
                    onPressed: () => context.go('/fasting'),
                    icon: const Icon(Icons.play_arrow),
                    label: const Text('Start a fast'))),
          ],
          if (numVal(widget.stats['completedFasts']) > 0) ...[
            const Divider(height: 18),
            Row(children: [
              Expanded(
                  child: Text(
                      '${numVal(widget.stats['completedFasts']).round()} completed fasts',
                      style: Theme.of(context).textTheme.labelMedium)),
              Text(
                  '${numVal(widget.stats['totalHoursFasted']).toStringAsFixed(1)} hours total',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ]),
          ],
        ]));
  }
}

class _NutritionDashboardCard extends StatelessWidget {
  const _NutritionDashboardCard(
      {required this.plan, required this.calculated, required this.logged});
  final Json plan, calculated, logged;
  @override
  Widget build(BuildContext context) {
    final calories =
        numVal(plan['daily_calories'] ?? calculated['dailyCalories'], 2000);
    final protein =
        numVal(plan['protein_grams'] ?? calculated['proteinGrams'], 160);
    final carbs = numVal(plan['carbs_grams'] ?? calculated['carbsGrams']);
    final fat = numVal(plan['fat_grams'] ?? calculated['fatGrams']);
    final loggedCalories = numVal(logged['calories']);
    final loggedProtein = numVal(logged['protein_grams']);
    final diet = str(plan['diet_type'], 'High protein · lower carb')
        .replaceAll('_', ' ');
    return SectionCard(
        padding: const EdgeInsets.all(17),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const _IconBadge(
                icon: Icons.restaurant_outlined, color: Color(0xff18b47b)),
            const SizedBox(width: 10),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Daily nutrition',
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700)),
                  Text(diet,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall)
                ])),
            _StatusPill(
                text: 'Target ${calories.round()} kcal',
                color: const Color(0xff18b47b)),
          ]),
          const SizedBox(height: 15),
          _NutritionProgress(
              label: 'Protein',
              actual: loggedProtein,
              target: protein,
              unit: 'g',
              color: const Color(0xff18b47b)),
          const SizedBox(height: 13),
          _NutritionProgress(
              label: 'Calories',
              actual: loggedCalories,
              target: calories,
              unit: 'kcal',
              color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 13),
          Wrap(spacing: 8, runSpacing: 6, children: [
            _MacroChip(label: 'Carbs', value: '${carbs.round()} g'),
            _MacroChip(label: 'Fat', value: '${fat.round()} g'),
          ]),
          const SizedBox(height: 7),
          Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                  onPressed: () => context.go('/nutrition'),
                  iconAlignment: IconAlignment.end,
                  icon: const Icon(Icons.arrow_forward, size: 16),
                  label: const Text('Log meal & macros'))),
        ]));
  }
}

class _NutritionProgress extends StatelessWidget {
  const _NutritionProgress(
      {required this.label,
      required this.actual,
      required this.target,
      required this.unit,
      required this.color});
  final String label, unit;
  final double actual, target;
  final Color color;
  @override
  Widget build(BuildContext context) {
    final fraction =
        target <= 0 ? 0.0 : (actual / target).clamp(0.0, 1.0).toDouble();
    final percent = target <= 0 ? 0 : (actual / target * 100).round();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(
            child: Text(label,
                style: Theme.of(context)
                    .textTheme
                    .labelLarge
                    ?.copyWith(fontWeight: FontWeight.w700))),
        Text('${actual.round()} / ${target.round()} $unit ($percent%)',
            style: Theme.of(context).textTheme.labelMedium)
      ]),
      const SizedBox(height: 6),
      ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: LinearProgressIndicator(
              value: fraction, minHeight: 6, color: color)),
    ]);
  }
}

class _MacroChip extends StatelessWidget {
  const _MacroChip({required this.label, required this.value});
  final String label, value;
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(99)),
      child: Text('$label · $value',
          style: Theme.of(context).textTheme.labelSmall));
}

class _RecentWeightEntry extends StatelessWidget {
  const _RecentWeightEntry(
      {required this.entry,
      required this.previous,
      required this.unit,
      required this.displayValue});
  final Json entry;
  final Json? previous;
  final String unit;
  final double Function(dynamic) displayValue;
  @override
  Widget build(BuildContext context) {
    final kg = numVal(entry['weight'] ?? entry['value']);
    final previousEntry = previous;
    final olderKg = previousEntry == null
        ? double.nan
        : numVal(previousEntry['weight'] ?? previousEntry['value']);
    final change = olderKg.isNaN ? double.nan : kg - olderKg;
    final color = change.isNaN || change == 0
        ? Theme.of(context).colorScheme.onSurfaceVariant
        : change < 0
            ? const Color(0xff18b47b)
            : Theme.of(context).colorScheme.error;
    final date = _dateOf(entry);
    return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
        child: Row(children: [
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(_longDate(date),
                    style: Theme.of(context)
                        .textTheme
                        .bodyMedium
                        ?.copyWith(fontWeight: FontWeight.w600)),
                if (str(entry['notes'], '').isNotEmpty)
                  Text(str(entry['notes']),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall)
              ])),
          if (!change.isNaN) ...[
            Text(
                '${change < 0 ? '↓' : change > 0 ? '↑' : '·'} ${displayValue(change).abs().toStringAsFixed(1)}',
                style: Theme.of(context)
                    .textTheme
                    .labelMedium
                    ?.copyWith(color: color, fontWeight: FontWeight.w700)),
            const SizedBox(width: 12)
          ],
          Text('${displayValue(kg).toStringAsFixed(1)} $unit',
              style: Theme.of(context)
                  .textTheme
                  .titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700)),
        ]));
  }
}

class _DashboardLineChart extends StatelessWidget {
  const _DashboardLineChart(
      {required this.points,
      required this.unit,
      required this.emptyTitle,
      required this.emptyDetail});
  final List<_ChartPoint> points;
  final String unit, emptyTitle, emptyDetail;
  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) return emptyMessage(context, emptyTitle, emptyDetail);
    final values = points.map((e) => e.value).toList();
    final minValue = values.reduce((a, b) => a < b ? a : b);
    final maxValue = values.reduce((a, b) => a > b ? a : b);
    final range = maxValue - minValue;
    final pad = range == 0
        ? (maxValue.abs() * .04).clamp(.5, 2.0).toDouble()
        : range * .16;
    final color = Theme.of(context).colorScheme.primary;
    return LineChart(LineChartData(
      minX: 0,
      maxX: (points.length - 1).toDouble().clamp(1, double.infinity).toDouble(),
      minY: minValue - pad,
      maxY: maxValue + pad,
      gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => FlLine(
              color: Theme.of(context).dividerColor.withValues(alpha: .18),
              dashArray: [4, 5])),
      borderData: FlBorderData(show: false),
      titlesData: FlTitlesData(
        topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        rightTitles:
            const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        leftTitles: AxisTitles(
            sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 42,
                getTitlesWidget: (value, meta) => Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: Text(value.toStringAsFixed(1),
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color:
                                Theme.of(context).colorScheme.onSurfaceVariant,
                            fontSize: 10))))),
        bottomTitles: AxisTitles(
            sideTitles: SideTitles(
                showTitles: points.length > 1,
                reservedSize: 28,
                interval: (points.length / 5)
                    .ceilToDouble()
                    .clamp(1, double.infinity)
                    .toDouble(),
                getTitlesWidget: (value, meta) {
                  final i = value.round().clamp(0, points.length - 1).toInt();
                  return SideTitleWidget(
                      axisSide: meta.axisSide,
                      child: Text(_shortDate(points[i].date),
                          style: Theme.of(context)
                              .textTheme
                              .labelSmall
                              ?.copyWith(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant,
                                  fontSize: 9)));
                })),
      ),
      lineTouchData: LineTouchData(
          touchTooltipData: LineTouchTooltipData(
              getTooltipItems: (spots) => spots.map((spot) {
                    final point = points[
                        spot.x.round().clamp(0, points.length - 1).toInt()];
                    return LineTooltipItem(
                        '${_longDate(point.date)}\n${point.value.toStringAsFixed(1)}$unit${point.category.isEmpty ? '' : ' · ${point.category}'}',
                        TextStyle(
                            color:
                                Theme.of(context).colorScheme.onInverseSurface,
                            fontWeight: FontWeight.w600,
                            fontSize: 11));
                  }).toList())),
      lineBarsData: [
        LineChartBarData(
          spots: [
            for (var i = 0; i < points.length; i++)
              FlSpot(i.toDouble(), points[i].value)
          ],
          isCurved: true,
          curveSmoothness: .18,
          barWidth: 2.7,
          color: color,
          dotData: FlDotData(show: points.length <= 12),
          belowBarData:
              BarAreaData(show: true, color: color.withValues(alpha: .1)),
        )
      ],
    ));
  }
}

class _ChartPoint {
  const _ChartPoint(this.date, this.value, {this.category = ''});
  final DateTime date;
  final double value;
  final String category;
}

class _RangeButton extends StatelessWidget {
  const _RangeButton(
      {required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(right: 3),
      child: selected
          ? FilledButton.tonal(
              onPressed: onTap,
              style: FilledButton.styleFrom(
                  minimumSize: const Size(42, 32),
                  padding: const EdgeInsets.symmetric(horizontal: 10)),
              child: Text(label))
          : TextButton(
              onPressed: onTap,
              style: TextButton.styleFrom(
                  minimumSize: const Size(42, 32),
                  padding: const EdgeInsets.symmetric(horizontal: 10)),
              child: Text(label)));
}

class _IconBadge extends StatelessWidget {
  const _IconBadge({required this.icon, required this.color});
  final IconData icon;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
          color: color.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(12)),
      child: Icon(icon, size: 19, color: color));
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.text, required this.color});
  final String text;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
          color: color.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(99)),
      child: Text(text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context)
              .textTheme
              .labelSmall
              ?.copyWith(color: color, fontWeight: FontWeight.w700)));
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

List<Json> _waistEntries(List<dynamic> entries) => entries
    .map(asJson)
    .where(
        (e) => str(e['slug'] ?? asJson(e['definition'])['slug'], '') == 'waist')
    .toList()
  ..sort((a, b) => _dateOf(b).compareTo(_dateOf(a)));

DateTime _dateOf(dynamic value) {
  final row = asJson(value);
  return DateTime.tryParse(str(row['recorded_at'] ?? row['date'], '')) ??
      DateTime(1970);
}

String _shortDate(DateTime date) => '${_month(date.month)} ${date.day}';
String _longDate(DateTime date) =>
    '${_month(date.month)} ${date.day}, ${date.year}';
String _month(int month) => const [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ][month - 1];
String _signed(double value) =>
    '${value > 0 ? '+' : ''}${value.toStringAsFixed(1)}';
double _lengthValue(double cm, String units) =>
    units == 'imperial' ? cm / 2.54 : cm;
double _weightToKg(double value, String unit) =>
    unit.toLowerCase() == 'lb' || unit.toLowerCase() == 'lbs'
        ? value / 2.20462
        : value;
String _heightLabel(double cm, String units) => units == 'imperial'
    ? "${(cm / 30.48).floor()}′${((cm / 2.54).round() % 12)}″"
    : '${cm.round()} cm';

double? _changeSince(List<dynamic> newestFirst, double latest, int days) {
  if (latest.isNaN) return null;
  final cutoff = DateTime.now().subtract(Duration(days: days));
  for (final raw in newestFirst) {
    final entry = asJson(raw);
    if (_dateOf(entry).isBefore(cutoff)) {
      return latest - numVal(entry['weight']);
    }
  }
  return null;
}

List<dynamic> _filterWeights(List<dynamic> newestFirst, String range) {
  final days = switch (range) {
    '7D' => 7,
    '30D' => 30,
    '90D' => 90,
    '6M' => 183,
    '1Y' => 365,
    _ => 0
  };
  if (days == 0) return newestFirst;
  final cutoff = DateTime.now().subtract(Duration(days: days));
  return newestFirst.where((e) => !_dateOf(e).isBefore(cutoff)).toList();
}

List<_ChartPoint> _filterPoints(List<_ChartPoint> points, String range) {
  final days = switch (range) { '30D' => 30, '90D' => 90, '1Y' => 365, _ => 0 };
  if (days == 0) return points;
  final cutoff = DateTime.now().subtract(Duration(days: days));
  return points.where((e) => !e.date.isBefore(cutoff)).toList();
}

int _streak(List<dynamic> newestFirst) {
  if (newestFirst.isEmpty) return 0;
  final dates = newestFirst.map((e) {
    final date = _dateOf(e);
    return DateTime(date.year, date.month, date.day);
  }).toSet();
  final now = DateTime.now();
  var date = DateTime(now.year, now.month, now.day);
  if (!dates.contains(date)) date = date.subtract(const Duration(days: 1));
  var count = 0;
  while (dates.contains(date)) {
    count++;
    date = date.subtract(const Duration(days: 1));
  }
  return count;
}

({double percent, double remaining}) _progress(
    double start, double target, double current) {
  final total = (target - start).abs();
  if (total == 0) return (percent: 100, remaining: (target - current).abs());
  final progress =
      ((current - start).abs() / total * 100).clamp(0.0, 100.0).toDouble();
  return (percent: progress, remaining: (target - current).abs());
}

Color _bmiColor(BuildContext context, String category) {
  final value = category.toLowerCase();
  if (value.contains('normal') || value.contains('healthy')) {
    return const Color(0xff18b47b);
  }
  if (value.contains('underweight')) return const Color(0xff42a5f5);
  if (value.contains('overweight')) return const Color(0xffffa31a);
  if (value.contains('obese')) return Theme.of(context).colorScheme.error;
  return Theme.of(context).colorScheme.primary;
}

String _ratioValue(dynamic value) => asJson(value).isEmpty
    ? '—'
    : numVal(asJson(value)['ratio']).toStringAsFixed(2);

String _ratioCategory(dynamic value) => str(asJson(value)['category'], '');
String _ratioDetail(dynamic value, String fallback) =>
    asJson(value).isEmpty ? fallback : _ratioCategory(value);
Color _riskColor(BuildContext context, String category) {
  final text = category.toLowerCase();
  if (text.contains('low') || text.contains('normal')) {
    return const Color(0xff18b47b);
  }
  if (text.contains('high') ||
      text.contains('elevated') ||
      text.contains('increased')) {
    return Theme.of(context).colorScheme.error;
  }
  if (text.isEmpty) return Theme.of(context).colorScheme.primary;
  return const Color(0xffffa31a);
}
