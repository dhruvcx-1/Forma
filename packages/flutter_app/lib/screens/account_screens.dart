import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:file_saver/file_saver.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../data/api_client.dart';
import '../state/theme_state.dart';
import '../widgets/forma_widgets.dart';
import 'record_screens.dart' show WeightLineChart;
import 'shared.dart';

class PhotosScreen extends StatefulWidget {
  const PhotosScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<PhotosScreen> createState() => _PhotosScreenState();
}

class _PhotosScreenState extends State<PhotosScreen> {
  late Future<List<dynamic>> _photos;
  final Set<String> selectedIds = {};
  void _load() => _photos = widget.api.getList('/photos');
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _chooseUpload() async {
    final view = await showModalBottomSheet<String>(
        context: context,
        showDragHandle: true,
        builder: (context) => SafeArea(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
              for (final item in const [
                ('front', 'Front'),
                ('side', 'Side'),
                ('back', 'Back'),
                ('other', 'Other')
              ])
                ListTile(
                    leading: const Icon(Icons.photo_camera_outlined),
                    title: Text(item.$2),
                    onTap: () => Navigator.pop(context, item.$1)),
            ])));
    if (view == null) return;
    final image = await ImagePicker().pickImage(
        source: ImageSource.gallery, imageQuality: 88, maxWidth: 2400);
    if (image == null) return;
    try {
      final bytes = await image.readAsBytes();
      final body = FormData.fromMap({
        'file': MultipartFile.fromBytes(bytes, filename: image.name),
        'view_type': view,
        'recorded_at': DateTime.now().toIso8601String()
      });
      await widget.api.dio.post('/photos', data: body);
      if (!mounted) return;
      setState(_load);
      await snack(context, 'Progress photo uploaded');
    } catch (e) {
      if (mounted) await showFormaError(context, e);
    }
  }

  Future<void> _compare() async {
    final ids = selectedIds.toList();
    if (ids.length != 2) return;
    try {
      final all = (await widget.api.getList('/photos')).map(asJson).toList();
      final chosen = all.where((p) => ids.contains(str(p['id']))).toList();
      final bytes = await Future.wait(
          ids.map((id) => widget.api.getBytes('/photos/$id/file')));
      if (!mounted || chosen.length != 2) return;
      await showDialog<void>(
          context: context,
          builder: (context) => Dialog(
              child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Text('Progress comparison',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 12),
                    Row(children: [
                      for (var i = 0; i < 2; i++)
                        Expanded(
                            child: Padding(
                                padding: const EdgeInsets.all(5),
                                child: Column(children: [
                                  Text(
                                      '${str(chosen[i]['view_type']).toUpperCase()} · ${str(chosen[i]['date'])}',
                                      textAlign: TextAlign.center),
                                  const SizedBox(height: 6),
                                  Image.memory(Uint8List.fromList(bytes[i]),
                                      height: 380, fit: BoxFit.contain)
                                ])))
                    ]),
                    TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text('Close')),
                  ]))));
    } catch (e) {
      if (mounted) await showFormaError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) => AsyncContent<List<dynamic>>(
        future: _photos,
        onRetry: () => setState(_load),
        builder: (context, photos) =>
            ListView(padding: const EdgeInsets.all(22), children: [
          PageHeading('Progress photos',
              subtitle:
                  'Private to your account. Compare your progress over time.',
              trailing: Wrap(spacing: 6, children: [
                if (selectedIds.length == 2)
                  OutlinedButton.icon(
                      onPressed: _compare,
                      icon: const Icon(Icons.compare_arrows),
                      label: const Text('Compare')),
                FilledButton.icon(
                    onPressed: _chooseUpload,
                    icon: const Icon(Icons.add_a_photo_outlined),
                    label: const Text('Add photo')),
              ])),
          if (photos.isEmpty)
            SectionCard(
                child: emptyMessage(context, 'Your private progress timeline',
                    'Add front, side or back photos to create a visual record.')),
          if (photos.isNotEmpty)
            LayoutBuilder(
                builder: (context, b) => GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: b.maxWidth > 800
                              ? 4
                              : b.maxWidth > 520
                                  ? 3
                                  : 2,
                          crossAxisSpacing: 12,
                          mainAxisSpacing: 12,
                          childAspectRatio: .76),
                      itemCount: photos.length,
                      itemBuilder: (context, i) {
                        final p = asJson(photos[i]);
                        return _PhotoCard(
                            api: widget.api,
                            photo: p,
                            selected: selectedIds.contains(str(p['id'])),
                            onToggle: () => setState(() {
                                  final id = str(p['id']);
                                  if (selectedIds.contains(id)) {
                                    selectedIds.remove(id);
                                  } else if (selectedIds.length < 2) {
                                    selectedIds.add(id);
                                  }
                                }),
                            onDelete: () async {
                              if (!await confirmAction(
                                  context,
                                  'Delete progress photo?',
                                  'The photo file and its record will be removed.')) {
                                return;
                              }
                              try {
                                await widget.api.delete('/photos/${p['id']}');
                                if (context.mounted) setState(_load);
                              } catch (e) {
                                if (context.mounted) {
                                  await showFormaError(context, e);
                                }
                              }
                            });
                      },
                    )),
          if (photos.length >= 2) ...[
            const SizedBox(height: 14),
            const SectionCard(
                child: Row(children: [
              Icon(Icons.compare_arrows),
              SizedBox(width: 10),
              Expanded(
                  child: Text(
                      'Open a photo to view it full size. Use matching views and similar dates when comparing your progress.'))
            ]))
          ],
        ]),
      );
}

class _PhotoCard extends StatelessWidget {
  const _PhotoCard(
      {required this.api,
      required this.photo,
      required this.onDelete,
      required this.selected,
      required this.onToggle});
  final ApiClient api;
  final Json photo;
  final VoidCallback onDelete;
  final bool selected;
  final VoidCallback onToggle;
  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
              child: FutureBuilder<List<int>>(
            future: api.getBytes('/photos/${photo['id']}/file'),
            builder: (context, snapshot) {
              if (snapshot.hasError) {
                return const Center(child: Icon(Icons.broken_image_outlined));
              }
              if (!snapshot.hasData) {
                return const Center(child: CircularProgressIndicator());
              }
              final image = Uint8List.fromList(snapshot.data!);
              return Stack(children: [
                InkWell(
                  onTap: () => showDialog<void>(
                      context: context,
                      builder: (_) => Dialog(
                          child: InteractiveViewer(
                              child:
                                  Image.memory(image, fit: BoxFit.contain)))),
                  child: Image.memory(image,
                      fit: BoxFit.cover, width: double.infinity),
                ),
                Positioned(
                    top: 4,
                    right: 4,
                    child: IconButton.filledTonal(
                        onPressed: onToggle,
                        icon: Icon(selected
                            ? Icons.check_circle
                            : Icons.circle_outlined)))
              ]);
            },
          )),
          Padding(
              padding: const EdgeInsets.fromLTRB(9, 4, 4, 8),
              child: Row(children: [
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(
                          str(photo['view_type'] ?? photo['viewType'])
                              .toUpperCase(),
                          style: Theme.of(context).textTheme.labelLarge),
                      Text(
                          str(photo['date'], displayDate(photo['recorded_at'])),
                          style: Theme.of(context).textTheme.bodySmall),
                    ])),
                IconButton(
                    tooltip: 'Delete',
                    onPressed: onDelete,
                    icon: const Icon(Icons.delete_outline, size: 20)),
              ])),
        ]),
      );
}

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late Future<(Json, Json, List<dynamic>)> _data;
  final c = <String, TextEditingController>{};
  String units = 'metric', sex = 'male';
  bool isPublic = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => _data = Future.wait<dynamic>([
        widget.api.getMap('/profile'),
        widget.api.getMap('/settings'),
        widget.api.getList('/measurements/definitions')
      ]).then((v) {
        final profile = asJson(v[0]);
        final settings = asJson(v[1]);
        units = str(settings['unit_system'], 'metric');
        sex = str(settings['sex'], 'male');
        isPublic = profile['is_public'] == 1 || profile['is_public'] == true;
        return (profile, settings, asList(v[2]));
      });
  TextEditingController _c(String key, dynamic value) =>
      c.putIfAbsent(key, () => TextEditingController(text: str(value, '')));

  Future<void> _saveProfile() async {
    try {
      await widget.api.put('/profile', {
        'display_name': c['display_name']?.text,
        'bio': c['bio']?.text,
        'is_public': isPublic
      });
      if (mounted) {
        setState(_load);
        await snack(context, 'Profile saved');
      }
    } catch (e) {
      if (mounted) await showFormaError(context, e);
    }
  }

  Future<void> _saveSettings() async {
    final payload = <String, String>{'unit_system': units, 'sex': sex};
    final height = c['height_cm']?.text.trim() ?? '';
    final dob = c['date_of_birth']?.text.trim() ?? '';
    if (height.isNotEmpty) payload['height_cm'] = height;
    if (dob.isNotEmpty) payload['date_of_birth'] = dob;
    try {
      await widget.api.put('/settings', payload);
      if (mounted) await snack(context, 'Preferences saved');
    } catch (e) {
      if (mounted) await showFormaError(context, e);
    }
  }

  Future<void> _uploadAvatar() async {
    final image = await ImagePicker().pickImage(
        source: ImageSource.gallery, imageQuality: 88, maxWidth: 1000);
    if (image == null) return;
    try {
      final bytes = await image.readAsBytes();
      await widget.api.dio.post('/profile/avatar',
          data: FormData.fromMap(
              {'file': MultipartFile.fromBytes(bytes, filename: image.name)}));
      if (mounted) setState(_load);
    } catch (e) {
      if (mounted) await showFormaError(context, e);
    }
  }

  Future<void> _removeAvatar() async {
    try {
      await widget.api.delete('/profile/avatar');
      if (mounted) setState(_load);
    } catch (e) {
      if (mounted) await showFormaError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) =>
      AsyncContent<(Json, Json, List<dynamic>)>(
        future: _data,
        onRetry: () => setState(_load),
        builder: (context, data) {
          final p = data.$1;
          final s = data.$2;
          final definitions = data.$3;
          final theme = context.watch<ThemeState>();
          return ListView(padding: const EdgeInsets.all(22), children: [
            const PageHeading('Settings',
                subtitle: 'Your profile, units, theme and privacy.'),
            SectionCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Profile',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 10),
                  Wrap(
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 12,
                      runSpacing: 8,
                      children: [
                        CircleAvatar(
                            radius: 28,
                            backgroundImage: p['avatar_url'] == null
                                ? null
                                : NetworkImage(
                                    Uri.parse(widget.api.dio.options.baseUrl)
                                        .replace(path: str(p['avatar_url']))
                                        .toString()),
                            child: p['avatar_url'] == null
                                ? const Icon(Icons.person_outline)
                                : null),
                        OutlinedButton.icon(
                            onPressed: _uploadAvatar,
                            icon: const Icon(Icons.photo_camera_outlined),
                            label: const Text('Change avatar')),
                        if (p['avatar_url'] != null)
                          IconButton(
                              tooltip: 'Remove avatar',
                              onPressed: _removeAvatar,
                              icon: const Icon(Icons.delete_outline)),
                      ]),
                  const SizedBox(height: 10),
                  Text('Username · ${str(p['username'])}'),
                  const SizedBox(height: 8),
                  TextField(
                      controller: _c('display_name', p['display_name']),
                      decoration:
                          const InputDecoration(labelText: 'Display name')),
                  const SizedBox(height: 10),
                  TextField(
                      controller: _c('bio', p['bio']),
                      maxLines: 3,
                      decoration: const InputDecoration(labelText: 'Bio')),
                  SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Public progress profile'),
                      subtitle: const Text(
                          'Let people view the public information you share.'),
                      value: isPublic,
                      onChanged: (v) => setState(() => isPublic = v)),
                  FilledButton(
                      onPressed: _saveProfile,
                      child: const Text('Save profile')),
                  if (p['username'] != null && isPublic) ...[
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                        onPressed: () => _copyPublicProfileLink(
                            context, widget.api, str(p['username'])),
                        icon: const Icon(Icons.link),
                        label: const Text('Copy public profile link')),
                  ],
                ])),
            const SizedBox(height: 14),
            SectionCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Custom measurement sites',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 6),
                  const Text(
                      'Manage the custom locations you added from Measurements.'),
                  if (definitions.where((raw) {
                    final d = asJson(raw);
                    return d['is_system'] != 1 && d['is_system'] != true;
                  }).isEmpty)
                    const Padding(
                        padding: EdgeInsets.only(top: 10),
                        child: Text(
                            'No custom sites yet. Add one from Measurements.')),
                  for (final raw in definitions.where((raw) {
                    final d = asJson(raw);
                    return d['is_system'] != 1 && d['is_system'] != true;
                  }))
                    Builder(builder: (context) {
                      final d = asJson(raw);
                      return ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(str(d['name'])),
                          subtitle: Text('Base unit: ${str(d['unit'])}'),
                          trailing: IconButton(
                              tooltip: 'Delete custom site',
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () async {
                                if (await confirmAction(
                                    context,
                                    'Delete ${str(d['name'])}?',
                                    'Historical entries for this site will also be deleted.')) {
                                  try {
                                    await widget.api.delete(
                                        '/measurements/definitions/${d['id']}');
                                    if (mounted) setState(_load);
                                  } catch (e) {
                                    if (context.mounted) {
                                      await showFormaError(context, e);
                                    }
                                  }
                                }
                              }));
                    }),
                ])),
            const SizedBox(height: 14),
            SectionCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Health preferences',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 10),
                  TextField(
                      controller: _c('height_cm', s['height_cm']),
                      keyboardType: TextInputType.number,
                      decoration:
                          const InputDecoration(labelText: 'Height in cm')),
                  const SizedBox(height: 10),
                  TextField(
                      controller: _c('date_of_birth', s['date_of_birth']),
                      decoration: const InputDecoration(
                          labelText: 'Date of birth (YYYY-MM-DD)')),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                      initialValue: units,
                      decoration: const InputDecoration(labelText: 'Units'),
                      items: const [
                        DropdownMenuItem(
                            value: 'metric', child: Text('Metric (kg, cm)')),
                        DropdownMenuItem(
                            value: 'imperial', child: Text('Imperial (lb, in)'))
                      ],
                      onChanged: (v) => setState(() => units = v ?? 'metric')),
                  const SizedBox(height: 10),
                  DropdownButtonFormField<String>(
                      initialValue: sex,
                      decoration: const InputDecoration(
                          labelText: 'Sex for body composition estimate'),
                      items: const [
                        DropdownMenuItem(value: 'male', child: Text('Male')),
                        DropdownMenuItem(
                            value: 'female', child: Text('Female')),
                        DropdownMenuItem(
                            value: 'other',
                            child: Text('Other / not specified'))
                      ],
                      onChanged: (v) => setState(() => sex = v ?? 'other')),
                  const SizedBox(height: 10),
                  FilledButton(
                      onPressed: _saveSettings,
                      child: const Text('Save health preferences')),
                ])),
            const SizedBox(height: 14),
            SectionCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Appearance',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  SegmentedButton<ThemeMode>(segments: const [
                    ButtonSegment(
                        value: ThemeMode.system,
                        label: Text('System'),
                        icon: Icon(Icons.settings_suggest_outlined)),
                    ButtonSegment(
                        value: ThemeMode.light,
                        label: Text('Light'),
                        icon: Icon(Icons.light_mode_outlined)),
                    ButtonSegment(
                        value: ThemeMode.dark,
                        label: Text('Dark'),
                        icon: Icon(Icons.dark_mode_outlined))
                  ], selected: {
                    theme.mode
                  }, onSelectionChanged: (v) => theme.setMode(v.first)),
                  const SizedBox(height: 16),
                  Text('Accent color',
                      style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 8),
                  Wrap(spacing: 12, runSpacing: 10, children: [
                    for (final entry in ThemeState.accents.entries)
                      Tooltip(
                          message: entry.key[0].toUpperCase() +
                              entry.key.substring(1),
                          child: InkWell(
                              onTap: () => theme.setAccent(entry.key),
                              customBorder: const CircleBorder(),
                              child: Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(
                                      color: entry.value,
                                      shape: BoxShape.circle,
                                      border: Border.all(
                                          color: theme.accent == entry.key
                                              ? Theme.of(context)
                                                  .colorScheme
                                                  .onSurface
                                              : Colors.transparent,
                                          width: 2),
                                      boxShadow: theme.accent == entry.key
                                          ? [
                                              BoxShadow(
                                                  color: entry.value
                                                      .withValues(alpha: .35),
                                                  blurRadius: 8)
                                            ]
                                          : null),
                                  child: theme.accent == entry.key
                                      ? const Icon(Icons.check,
                                          color: Colors.white, size: 19)
                                      : null))),
                  ]),
                ])),
            const SizedBox(height: 14),
            SectionCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Account',
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Text('Role · ${str(p['role'], 'user')}'),
                  Text('Created · ${displayDate(p['created_at'])}'),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                      onPressed: () => context.go('/data'),
                      icon: const Icon(Icons.backup_outlined),
                      label: const Text('Data export & backups')),
                  if (p['role'] == 'admin')
                    OutlinedButton.icon(
                        onPressed: () => context.go('/admin'),
                        icon: const Icon(Icons.admin_panel_settings_outlined),
                        label: const Text('Administration')),
                ])),
            const SizedBox(height: 14),
            const SectionCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('About Forma',
                      style:
                          TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
                  SizedBox(height: 8),
                  Text(
                      'A private, self-hosted tracker for weight, measurements, nutrition, fasting and progress. Your records stay with your Forma server.'),
                  SizedBox(height: 8),
                  Text('Flutter edition · Privacy first · No telemetry'),
                ])),
          ]);
        },
      );
}

class DataScreen extends StatefulWidget {
  const DataScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<DataScreen> createState() => _DataScreenState();
}

class _DataScreenState extends State<DataScreen> {
  final input = TextEditingController();
  Json? preview;
  bool busy = false;
  Future<void> _exportJson() async {
    try {
      final payload = await widget.api.getMap('/export/json');
      final bytes = Uint8List.fromList(
          utf8.encode(const JsonEncoder.withIndent('  ').convert(payload)));
      await FileSaver.instance.saveFile(
          name: 'forma-backup-${today()}',
          bytes: bytes,
          fileExtension: 'json',
          mimeType: MimeType.json);
      if (!mounted) return;
      await snack(context, 'JSON backup saved');
    } catch (e) {
      if (!mounted) return;
      await showFormaError(context, e);
    }
  }

  Future<void> _exportCsv(String path) async {
    try {
      final response = await widget.api.dio.get<String>(path,
          options: Options(responseType: ResponseType.plain));
      await FileSaver.instance.saveFile(
          name: path.contains('measurements')
              ? 'forma-measurements-${today()}'
              : 'forma-weight-${today()}',
          bytes: Uint8List.fromList(utf8.encode(response.data ?? '')),
          fileExtension: 'csv',
          mimeType: MimeType.csv);
      if (!mounted) return;
      await snack(context, 'CSV export saved');
    } catch (e) {
      if (!mounted) return;
      await showFormaError(context, e);
    }
  }

  Future<void> _pickImport() async {
    final file = await FilePicker.platform.pickFiles(
        type: FileType.custom, allowedExtensions: ['json'], withData: true);
    if (!mounted) return;
    if (file == null) return;
    final bytes = file.files.single.bytes;
    if (bytes == null) return;
    input.text = utf8.decode(bytes);
    setState(() => preview = null);
  }

  Future<void> _previewImport() async {
    try {
      final payload = jsonDecode(input.text);
      setState(() => busy = true);
      final result =
          await widget.api.postDynamic('/import/json?preview=1', payload);
      if (!mounted) return;
      setState(() => preview = asJson(result));
    } catch (e) {
      if (!mounted) return;
      await showFormaError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _commitImport() async {
    if (preview == null) return;
    if (!await confirmAction(context, 'Import this backup?',
        'Entries with matching dates will be skipped or upserted according to the existing Forma import rules.')) {
      return;
    }
    if (!mounted) return;
    try {
      setState(() => busy = true);
      final result = asJson(
          await widget.api.postDynamic('/import/json', jsonDecode(input.text)));
      if (!mounted) return;
      setState(() => preview = result);
      await snack(context, 'Import complete');
    } catch (e) {
      if (!mounted) return;
      await showFormaError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(22), children: [
        PageHeading('Data & backups',
            subtitle:
                'Export a portable copy or import records into your account.'),
        SectionCard(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Export', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          const Text(
              'JSON contains your weight and measurement history, definitions, goals and photo metadata. Image files remain stored in your Forma data directory.'),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            FilledButton.icon(
                onPressed: _exportJson,
                icon: const Icon(Icons.download_outlined),
                label: const Text('Download JSON backup')),
            OutlinedButton.icon(
                onPressed: () => _exportCsv('/export/csv/weight'),
                icon: const Icon(Icons.table_chart_outlined),
                label: const Text('Weight CSV')),
            OutlinedButton.icon(
                onPressed: () => _exportCsv('/export/csv/measurements'),
                icon: const Icon(Icons.straighten),
                label: const Text('Measurements CSV'))
          ])
        ])),
        const SizedBox(height: 14),
        SectionCard(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Import JSON backup',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          const Text(
              'Review a preview before writing records. Existing data is not deleted.'),
          const SizedBox(height: 12),
          Wrap(spacing: 8, children: [
            OutlinedButton.icon(
                onPressed: _pickImport,
                icon: const Icon(Icons.upload_file),
                label: const Text('Choose JSON file')),
            FilledButton(
                onPressed: busy ? null : _previewImport,
                child: Text(busy ? 'Reading…' : 'Preview import'))
          ]),
          const SizedBox(height: 10),
          TextField(
              controller: input,
              minLines: 4,
              maxLines: 8,
              decoration:
                  const InputDecoration(labelText: 'Or paste JSON backup')),
          if (preview != null) ...[
            const SizedBox(height: 12),
            SelectableText(const JsonEncoder.withIndent('  ').convert(preview)),
            const SizedBox(height: 10),
            FilledButton.icon(
                onPressed: busy ? null : _commitImport,
                icon: const Icon(Icons.check),
                label: const Text('Import these records'))
          ]
        ])),
        const SizedBox(height: 14),
        SectionCard(
            child: Row(children: [
          const Icon(Icons.shield_outlined),
          const SizedBox(width: 10),
          const Expanded(
              child: Text(
                  'Forma keeps account data on your server. Downloaded backups may include sensitive health information; keep them somewhere private.'))
        ]))
      ]);
}

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key, required this.api});
  final ApiClient api;
  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  late Future<(List<dynamic>, Json)> _data;
  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => _data = Future.wait<dynamic>([
        widget.api.getList('/admin/users'),
        widget.api.getMap('/admin/settings')
      ]).then((v) => (asList(v[0]), asJson(v[1])));

  @override
  Widget build(BuildContext context) => AsyncContent<(List<dynamic>, Json)>(
        future: _data,
        onRetry: () => setState(_load),
        builder: (context, d) {
          final users = d.$1;
          final settings = d.$2;
          return ListView(padding: const EdgeInsets.all(22), children: [
            const PageHeading('Administration',
                subtitle: 'Manage accounts and instance registration policy.'),
            SectionCard(
                child: SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Allow new registrations'),
                    subtitle: const Text(
                        'Existing accounts can continue to sign in.'),
                    value: settings['registration_enabled'] == true,
                    onChanged: (v) async {
                      try {
                        await widget.api.put(
                            '/admin/settings', {'registration_enabled': v});
                        if (context.mounted) setState(_load);
                      } catch (e) {
                        if (context.mounted) await showFormaError(context, e);
                      }
                    })),
            const SizedBox(height: 14),
            SectionCard(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                  Text('Users · ${users.length}',
                      style: Theme.of(context).textTheme.titleLarge),
                  for (final raw in users)
                    Builder(builder: (context) {
                      final u = asJson(raw);
                      return ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(str(u['displayName'] ?? u['username'])),
                          subtitle: Text(
                              '@${str(u['username'])} · ${u['weightCount']} weights · ${u['measurementCount']} measurements'),
                          trailing: PopupMenuButton<String>(
                            onSelected: (v) async {
                              try {
                                if (v == 'role') {
                                  await widget.api.put(
                                      '/admin/users/${u['id']}/role', {
                                    'role':
                                        u['role'] == 'admin' ? 'user' : 'admin'
                                  });
                                } else if (v == 'delete' &&
                                    await confirmAction(
                                        context,
                                        'Delete account?',
                                        'This removes this user and their stored records.')) {
                                  await widget.api
                                      .delete('/admin/users/${u['id']}');
                                }
                                if (context.mounted) setState(_load);
                              } catch (e) {
                                if (context.mounted) {
                                  await showFormaError(context, e);
                                }
                              }
                            },
                            itemBuilder: (_) => [
                              PopupMenuItem(
                                  value: 'role',
                                  child: Text(u['role'] == 'admin'
                                      ? 'Make user'
                                      : 'Make admin')),
                              const PopupMenuItem(
                                  value: 'delete', child: Text('Delete user'))
                            ],
                          ));
                    }),
                ])),
          ]);
        },
      );
}

Future<void> _copyPublicProfileLink(
    BuildContext context, ApiClient api, String username) async {
  final base = Uri.parse(api.dio.options.baseUrl);
  final path = base.path.replaceFirst(RegExp(r'/api/?$'), '');
  final origin = base.replace(path: path, query: null, fragment: null);
  final link = origin.resolve('/@${Uri.encodeComponent(username)}').toString();
  try {
    await Clipboard.setData(ClipboardData(text: link));
    if (context.mounted) await snack(context, 'Public profile link copied');
  } catch (_) {
    if (!context.mounted) return;
    await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
              title: const Text('Copy your profile link'),
              content: SelectableText(link),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Done'))
              ],
            ));
  }
}

class PublicProfileScreen extends StatefulWidget {
  const PublicProfileScreen(
      {super.key, required this.api, required this.username});
  final ApiClient api;
  final String username;
  @override
  State<PublicProfileScreen> createState() => _PublicProfileScreenState();
}

class _PublicProfileScreenState extends State<PublicProfileScreen> {
  late Future<Json> _profile;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => _profile = widget.api.getMap(
      '/public/profile/${Uri.encodeComponent(widget.username.replaceFirst(RegExp(r'^@'), ''))}');

  Future<void> _copyLink(String username) =>
      _copyPublicProfileLink(context, widget.api, username);

  @override
  Widget build(BuildContext context) => FutureBuilder<Json>(
      future: _profile,
      builder: (context, s) {
        if (s.hasError) {
          return Scaffold(
              appBar: AppBar(title: const Text('Forma')),
              body: Center(
                  child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 430),
                      child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: SectionCard(
                              child: emptyMessage(
                                  context,
                                  'Profile unavailable',
                                  'This profile may be private or the link may have changed.'))))));
        }
        if (!s.hasData) {
          return Scaffold(
              appBar: AppBar(title: const Text('Forma')),
              body: const Center(child: CircularProgressIndicator()));
        }
        final result = s.data!,
            p = asJson(result['profile']),
            stats = asJson(result['stats']),
            history = asList(result['history']);
        final unit = stats['unit_system'] == 'imperial' ? 'lb' : 'kg';
        final current = numVal(stats['current_weight'], double.nan);
        final start = numVal(stats['start_weight'], double.nan);
        final change = numVal(stats['total_change'], double.nan);
        final goal = numVal(stats['goal_weight'], double.nan);
        final displayName =
            str(p['display_name'], str(p['username'], 'Forma member'));
        final avatar = p['avatar_url'] == null
            ? null
            : Uri.parse(widget.api.dio.options.baseUrl)
                .replace(path: str(p['avatar_url']))
                .toString();
        final width = MediaQuery.sizeOf(context).width;
        final compact = width < 600;
        return Scaffold(
            appBar: AppBar(
                title: const Text('FORMA',
                    style: TextStyle(
                        fontWeight: FontWeight.w800, letterSpacing: 2)),
                actions: [
                  IconButton(
                      tooltip: 'Copy profile link',
                      onPressed: () => _copyLink(str(p['username'])),
                      icon: const Icon(Icons.ios_share_outlined)),
                  const SizedBox(width: 8)
                ]),
            body: ListView(
                padding: EdgeInsets.fromLTRB(
                    compact ? 16 : 28, 18, compact ? 16 : 28, 32),
                children: [
                  Center(
                      child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 940),
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Card(
                                    child: Padding(
                                        padding:
                                            EdgeInsets.all(compact ? 18 : 26),
                                        child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Row(
                                                  crossAxisAlignment:
                                                      CrossAxisAlignment.start,
                                                  children: [
                                                    CircleAvatar(
                                                        radius:
                                                            compact ? 28 : 34,
                                                        backgroundImage:
                                                            avatar == null
                                                                ? null
                                                                : NetworkImage(
                                                                    avatar),
                                                        child: avatar == null
                                                            ? Text(
                                                                displayName
                                                                    .characters
                                                                    .first
                                                                    .toUpperCase(),
                                                                style: Theme.of(
                                                                        context)
                                                                    .textTheme
                                                                    .titleLarge)
                                                            : null),
                                                    const SizedBox(width: 14),
                                                    Expanded(
                                                        child: Column(
                                                            crossAxisAlignment:
                                                                CrossAxisAlignment
                                                                    .start,
                                                            children: [
                                                          Text(displayName,
                                                              maxLines: 2,
                                                              overflow:
                                                                  TextOverflow
                                                                      .ellipsis,
                                                              style: Theme.of(
                                                                      context)
                                                                  .textTheme
                                                                  .headlineSmall
                                                                  ?.copyWith(
                                                                      fontWeight:
                                                                          FontWeight
                                                                              .w700)),
                                                          const SizedBox(
                                                              height: 2),
                                                          Text(
                                                              '@${str(p['username'])}',
                                                              style: Theme.of(
                                                                      context)
                                                                  .textTheme
                                                                  .bodyMedium
                                                                  ?.copyWith(
                                                                      color: Theme.of(
                                                                              context)
                                                                          .colorScheme
                                                                          .onSurfaceVariant)),
                                                        ])),
                                                    if (!compact)
                                                      Icon(
                                                          Icons.public_outlined,
                                                          color:
                                                              Theme.of(context)
                                                                  .colorScheme
                                                                  .primary),
                                                  ]),
                                              if (str(p['bio'], '')
                                                  .isNotEmpty) ...[
                                                const SizedBox(height: 16),
                                                Text(str(p['bio']),
                                                    style: Theme.of(context)
                                                        .textTheme
                                                        .bodyLarge),
                                              ],
                                              const SizedBox(height: 16),
                                              Wrap(
                                                  spacing: 8,
                                                  runSpacing: 8,
                                                  children: [
                                                    _ProfileTag(
                                                        icon: Icons
                                                            .monitor_weight_outlined,
                                                        text:
                                                            'Weight progress'),
                                                    _ProfileTag(
                                                        icon: Icons
                                                            .event_available_outlined,
                                                        text:
                                                            '${numVal(stats['total_entries']).round()} entries'),
                                                    if (stats['latest_date'] !=
                                                        null)
                                                      _ProfileTag(
                                                          icon: Icons
                                                              .update_outlined,
                                                          text:
                                                              'Updated ${displayDate(stats['latest_date']).split(' ').first}'),
                                                  ]),
                                            ]))),
                                const SizedBox(height: 16),
                                Text('Progress summary',
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleLarge
                                        ?.copyWith(
                                            fontWeight: FontWeight.w700)),
                                const SizedBox(height: 10),
                                MetricGrid(children: [
                                  MetricTile(
                                      label: 'Current weight',
                                      value: current.isNaN
                                          ? '—'
                                          : '${current.toStringAsFixed(1)} $unit',
                                      detail: stats['latest_date'] == null
                                          ? 'Latest entry'
                                          : 'As of ${displayDate(stats['latest_date']).split(' ').first}',
                                      icon: Icons.monitor_weight_outlined),
                                  MetricTile(
                                      label: 'Starting weight',
                                      value: start.isNaN
                                          ? '—'
                                          : '${start.toStringAsFixed(1)} $unit',
                                      detail: stats['first_date'] == null
                                          ? 'First recorded'
                                          : 'Since ${displayDate(stats['first_date']).split(' ').first}',
                                      icon: Icons.flag_outlined),
                                  MetricTile(
                                      label: 'Total change',
                                      value: change.isNaN
                                          ? '—'
                                          : '${change > 0 ? '+' : ''}${change.toStringAsFixed(1)} $unit',
                                      detail: change.isNaN
                                          ? 'Add weight entries to see change'
                                          : change < 0
                                              ? 'Down from starting weight'
                                              : change > 0
                                                  ? 'Up from starting weight'
                                                  : 'No net change',
                                      icon: change.isNaN || change == 0
                                          ? Icons.trending_flat
                                          : change < 0
                                              ? Icons.trending_down
                                              : Icons.trending_up),
                                  if (!goal.isNaN)
                                    MetricTile(
                                        label: 'Goal weight',
                                        value:
                                            '${goal.toStringAsFixed(1)} $unit',
                                        detail: stats['goal_target_date'] ==
                                                null
                                            ? 'Personal target'
                                            : 'Target ${displayDate(stats['goal_target_date']).split(' ').first}',
                                        icon: Icons.track_changes_outlined),
                                ]),
                                const SizedBox(height: 16),
                                SectionCard(
                                    child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                      Row(children: [
                                        Icon(Icons.show_chart,
                                            color: Theme.of(context)
                                                .colorScheme
                                                .primary),
                                        const SizedBox(width: 9),
                                        Expanded(
                                            child: Text('Weight trend',
                                                style: Theme.of(context)
                                                    .textTheme
                                                    .titleLarge
                                                    ?.copyWith(
                                                        fontWeight:
                                                            FontWeight.w700))),
                                        Text(unit,
                                            style: Theme.of(context)
                                                .textTheme
                                                .labelLarge
                                                ?.copyWith(
                                                    color: Theme.of(context)
                                                        .colorScheme
                                                        .onSurfaceVariant))
                                      ]),
                                      const SizedBox(height: 6),
                                      Text(
                                          history.length < 2
                                              ? 'Your shared weight entries'
                                              : '${history.length} recorded entries over time',
                                          style: Theme.of(context)
                                              .textTheme
                                              .bodySmall),
                                      const SizedBox(height: 12),
                                      SizedBox(
                                          height: 240,
                                          child: WeightLineChart(
                                              entries: history, unit: unit)),
                                    ])),
                              ]))),
                ]));
      });
}

class _ProfileTag extends StatelessWidget {
  const _ProfileTag({required this.icon, required this.text});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
        decoration: BoxDecoration(
            color: Theme.of(context)
                .colorScheme
                .secondaryContainer
                .withValues(alpha: .55),
            borderRadius: BorderRadius.circular(99)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 15, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 6),
          Text(text, style: Theme.of(context).textTheme.labelMedium),
        ]),
      );
}

class FastingWidgetScreen extends StatelessWidget {
  const FastingWidgetScreen({super.key, required this.api});
  final ApiClient api;
  @override
  Widget build(BuildContext context) {
    final uri = Uri.base;
    final token = uri.queryParameters['token'];
    final user = uri.queryParameters['username'];
    final query = token != null
        ? '?token=${Uri.encodeQueryComponent(token)}'
        : user != null
            ? '?username=${Uri.encodeQueryComponent(user)}'
            : '';
    return FutureBuilder<Json>(
        future: api.getMap('/public/fasting/widget$query'),
        builder: (context, s) {
          if (s.hasError) {
            return const Scaffold(
                body: Center(child: Text('Fasting widget unavailable')));
          }
          if (!s.hasData) {
            return const Scaffold(
                body: Center(child: CircularProgressIndicator()));
          }
          final data = s.data!,
              fast = asJson(data['fast']),
              profile = asJson(data['profile']);
          final stage = asJson(fast['stage']);
          return Scaffold(
              body: Center(
                  child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 460),
                      child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: SectionCard(
                              child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                const Icon(Icons.bolt, size: 36),
                                const SizedBox(height: 8),
                                Text(
                                    str(
                                        profile['display_name'] ??
                                            profile['username'],
                                        'Forma fasting'),
                                    style:
                                        Theme.of(context).textTheme.titleLarge),
                                const SizedBox(height: 14),
                                Text(data['active'] != true
                                    ? 'No active fast'
                                    : '${str(fast['fast_type'])} fast in progress'),
                                if (data['active'] == true) ...[
                                  const SizedBox(height: 8),
                                  Text(
                                      '${_widgetDuration(numVal(fast['elapsed_seconds']))} elapsed',
                                      style: Theme.of(context)
                                          .textTheme
                                          .displaySmall),
                                  Text(
                                      '${numVal(fast['progress_percent']).round()}% of ${numVal(fast['target_duration_hours']).round()} hours'),
                                  const SizedBox(height: 10),
                                  LinearProgressIndicator(
                                      value: (numVal(fast['progress_percent']) /
                                              100)
                                          .clamp(0.0, 1.0),
                                      minHeight: 8),
                                  const SizedBox(height: 12),
                                  Text(str(stage['name']),
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleMedium),
                                  Text(str(stage['tagline']),
                                      textAlign: TextAlign.center),
                                ],
                                const SizedBox(height: 10),
                                const Text('Powered by Forma')
                              ]))))));
        });
  }
}

String _widgetDuration(double seconds) {
  final total = seconds.round();
  final h = total ~/ 3600, m = (total % 3600) ~/ 60;
  return '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}';
}
