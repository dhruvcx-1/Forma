import 'package:flutter/material.dart';
import 'package:dio/dio.dart';

import '../data/api_client.dart';
import 'shared.dart';

class AiScreen extends StatefulWidget {
  const AiScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<AiScreen> createState() => _AiScreenState();
}

class _AiScreenState extends State<AiScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _baseUrl = TextEditingController(text: 'https://api.openai.com/v1');
  final _model = TextEditingController();
  final _key = TextEditingController();
  final _customPrompt = TextEditingController();
  final _message = TextEditingController();
  bool _enabled = false;
  bool _hasKey = false;
  bool _busy = false;
  String _mode = 'friend';
  String? _notice;
  String? _error;
  List<dynamic> _reports = [];
  List<dynamic> _messages = [];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    _baseUrl.dispose();
    _model.dispose();
    _key.dispose();
    _customPrompt.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _busy = true);
    try {
      final values = await Future.wait([
        widget.api.getMap('/ai/settings'),
        widget.api.getDynamicList('/ai/weekly-reports'),
        widget.api.getList('/ai/chat'),
      ]);
      if (!mounted) return;
      final settings = Map<String, dynamic>.from(values[0] as Map);
      setState(() {
        _enabled = settings['enabled'] == true;
        _hasKey = settings['hasApiKey'] == true;
        _baseUrl.text = settings['baseUrl']?.toString() ?? _baseUrl.text;
        _model.text = settings['model']?.toString() ?? '';
        _mode = settings['coachMode']?.toString() ?? 'friend';
        _customPrompt.text = settings['customCoachPrompt']?.toString() ?? '';
        _reports = values[1] as List<dynamic>;
        _messages = values[2] as List<dynamic>;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = _errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _errorText(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map && data['error'] != null) return data['error'].toString();
      return error.message ?? 'Request failed.';
    }
    return error.toString();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() { _busy = true; _notice = null; _error = null; });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _error = _errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _save() => _run(() async {
    final payload = <String, dynamic>{
      'enabled': _enabled,
      'baseUrl': _baseUrl.text.trim(),
      'model': _model.text.trim(),
      'coachMode': _mode,
      'customCoachPrompt': _customPrompt.text,
    };
    if (_key.text.trim().isNotEmpty) payload['apiKey'] = _key.text.trim();
    final settings = await widget.api.put('/ai/settings', payload);
    if (!mounted) return;
    setState(() {
      _hasKey = settings['hasApiKey'] == true;
      _key.clear();
      _notice = 'AI settings saved.';
    });
  });

  Future<void> _test() => _run(() async {
    await widget.api.post('/ai/test', {});
    if (mounted) setState(() => _notice = 'Provider connection succeeded.');
  });

  Future<void> _generateReport() => _run(() async {
    await widget.api.post('/ai/weekly-report', {});
    final reports = await widget.api.getDynamicList('/ai/weekly-reports');
    if (mounted) setState(() { _reports = reports; _notice = 'Weekly report generated.'; });
  });

  Future<void> _sendMessage() async {
    final message = _message.text.trim();
    if (message.isEmpty) return;
    _message.clear();
    await _run(() async {
      final result = await widget.api.post('/ai/chat', {'message': message});
      if (mounted) setState(() => _messages = [..._messages, {'role': 'user', 'content': message}, result]);
    });
  }

  Future<void> _clearChat() => _run(() async {
    await widget.api.delete('/ai/chat');
    if (mounted) setState(() { _messages = []; _notice = 'Chat history cleared.'; });
  });

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('AI coach & reports'), bottom: TabBar(controller: _tabs, tabs: const [Tab(text: 'Setup'), Tab(text: 'Weekly report'), Tab(text: 'Coach')])) ,
    body: Column(children: [
      if (_error != null) MaterialBanner(content: Text(_error!), actions: [TextButton(onPressed: () => setState(() => _error = null), child: const Text('Dismiss'))]),
      if (_notice != null) MaterialBanner(content: Text(_notice!), actions: [TextButton(onPressed: () => setState(() => _notice = null), child: const Text('OK'))]),
      if (_busy) const LinearProgressIndicator(),
      Expanded(child: TabBarView(controller: _tabs, children: [_setupTab(), _reportTab(), _coachTab()])),
    ]),
  );

  Widget _setupTab() => ListView(padding: const EdgeInsets.all(20), children: [
    const _InfoCard(text: 'AI is optional and uses your own provider account. When you generate a report or chat, Forma sends relevant health records to the configured AI provider. Forma excludes your name, username, biography, and photos. Provider terms and retention policies still apply.'),
    SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Enable AI features'), subtitle: const Text('Turn this on after saving a provider and model.'), value: _enabled, onChanged: (value) => setState(() => _enabled = value)),
    TextField(controller: _baseUrl, decoration: const InputDecoration(labelText: 'API base URL', hintText: 'https://api.openai.com/v1')),
    TextField(controller: _model, decoration: const InputDecoration(labelText: 'Model', hintText: 'Provider model name')),
    TextField(controller: _key, obscureText: true, autofillHints: const [AutofillHints.password], decoration: InputDecoration(labelText: _hasKey ? 'API token (saved; enter to replace)' : 'API token', helperText: 'Stored encrypted on your Forma server. Never returned to the app.')),
    const SizedBox(height: 14),
    DropdownButtonFormField<String>(value: _mode, decoration: const InputDecoration(labelText: 'Coach personality'), items: const [DropdownMenuItem(value: 'experienced', child: Text('Experienced gym coach')), DropdownMenuItem(value: 'friend', child: Text('Expert friend')), DropdownMenuItem(value: 'edgy', child: Text('Edgy gym coach')), DropdownMenuItem(value: 'custom', child: Text('Custom prompt'))], onChanged: (value) => setState(() => _mode = value ?? 'friend')),
    if (_mode == 'custom') Padding(padding: const EdgeInsets.only(top: 12), child: TextField(controller: _customPrompt, minLines: 4, maxLines: 10, maxLength: 8000, decoration: const InputDecoration(labelText: 'Your coach system prompt', alignLabelWithHint: true, hintText: 'Describe the voice, expertise, and coaching approach you want. Fixed safety boundaries still apply.'))),
    const SizedBox(height: 16),
    Wrap(spacing: 10, runSpacing: 8, children: [FilledButton.icon(onPressed: _busy ? null : _save, icon: const Icon(Icons.save_outlined), label: const Text('Save settings')), OutlinedButton.icon(onPressed: _busy ? null : _test, icon: const Icon(Icons.wifi_tethering), label: const Text('Test provider')), if (_hasKey) TextButton.icon(onPressed: _busy ? null : () => _run(() async { await widget.api.delete('/ai/settings/key'); if (mounted) setState(() { _hasKey = false; _enabled = false; _notice = 'Provider token removed.'; }); }), icon: const Icon(Icons.key_off), label: const Text('Remove token'))]),
  ]);

  Widget _reportTab() => ListView(padding: const EdgeInsets.all(20), children: [
    const _InfoCard(text: 'Generate a report for the latest 7 days and compare it with the previous 7 days. Reports are created only when you request them.'),
    FilledButton.icon(onPressed: _busy ? null : _generateReport, icon: const Icon(Icons.auto_awesome), label: const Text('Generate this week’s report')),
    const SizedBox(height: 16),
    if (_reports.isEmpty) const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('No reports yet.'))),
    for (final item in _reports) ...[
      _ReportCard(item: Map<String, dynamic>.from(item as Map)),
      const SizedBox(height: 10),
    ],
  ]);

  Widget _coachTab() => Column(children: [
    Padding(padding: const EdgeInsets.fromLTRB(16, 10, 16, 4), child: Row(children: [const Expanded(child: Text('The coach can use your weight, measurements, goals, nutrition, fasting, and relevant settings. Names and photos are excluded.')), IconButton(tooltip: 'Clear chat', onPressed: _busy ? null : _clearChat, icon: const Icon(Icons.delete_outline))])),
    Expanded(child: _messages.isEmpty ? const Center(child: Text('Ask about training, building a routine, or your progress.')) : ListView.builder(padding: const EdgeInsets.all(16), itemCount: _messages.length, itemBuilder: (context, index) { final message = Map<String, dynamic>.from(_messages[index] as Map); final user = message['role'] == 'user'; return Align(alignment: user ? Alignment.centerRight : Alignment.centerLeft, child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 680), child: Card(color: user ? Theme.of(context).colorScheme.primaryContainer : null, child: Padding(padding: const EdgeInsets.all(14), child: Text(message['content']?.toString() ?? ''))))); })),
    SafeArea(top: false, child: Padding(padding: const EdgeInsets.all(12), child: Row(children: [Expanded(child: TextField(controller: _message, minLines: 1, maxLines: 4, onSubmitted: (_) => _sendMessage(), decoration: const InputDecoration(hintText: 'Message your coach', border: OutlineInputBorder()))), const SizedBox(width: 8), IconButton.filled(onPressed: _busy ? null : _sendMessage, icon: const Icon(Icons.send))]))),
  ]);
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [const Icon(Icons.info_outline), const SizedBox(width: 12), Expanded(child: Text(text))])));
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.item});
  final Map<String, dynamic> item;
  @override
  Widget build(BuildContext context) {
    final from = item['weekStart']?.toString() ?? '';
    final to = item['weekEnd']?.toString() ?? '';
    return Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(from.isEmpty ? 'Weekly report' : '$from – $to', style: Theme.of(context).textTheme.titleMedium), const SizedBox(height: 10), SelectableText(item['content']?.toString() ?? '')])));
  }
}
