import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';

import '../data/api_client.dart';

class AiScreen extends StatefulWidget {
  const AiScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<AiScreen> createState() => _AiScreenState();
}

class _AiScreenState extends State<AiScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _baseUrl = TextEditingController(text: 'https://api.openai.com/v1');
  final _model = TextEditingController();
  final _key = TextEditingController();
  final _customPrompt = TextEditingController();
  final _customCoachName = TextEditingController();
  final _message = TextEditingController();
  final _memory = TextEditingController();
  Uint8List? _userAvatarBytes;
  Uint8List? _customCoachAvatarBytes;
  String? _customCoachAvatarUrl;
  bool _enabled = false;
  bool _hasKey = false;
  bool _serverEncryptionReady = false;
  bool _shareUserName = false;
  bool _busy = false;
  int _chatHistoryLimit = 20;
  String? _memoryUpdatedAt;
  String _mode = 'friend';
  String? _notice;
  String? _error;
  List<dynamic> _reports = [];
  List<dynamic> _messages = [];
  List<String> _models = [];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this, initialIndex: 0);
    _load();
  }

  @override
  void dispose() {
    _tabs.dispose();
    _baseUrl.dispose();
    _model.dispose();
    _key.dispose();
    _customPrompt.dispose();
    _customCoachName.dispose();
    _message.dispose();
    _memory.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _busy = true);
    try {
      final values = await Future.wait([
        widget.api.getMap('/ai/settings'),
        widget.api.getDynamicList('/ai/weekly-reports'),
        widget.api.getList('/ai/chat'),
        widget.api.getMap('/ai/chat/memory'),
        widget.api.getMap('/profile'),
      ]);
      if (!mounted) return;
      final settings = Map<String, dynamic>.from(values[0] as Map);
      final memory = Map<String, dynamic>.from(values[3] as Map);
      final profile = Map<String, dynamic>.from(values[4] as Map);
      final userAvatarUrl = profile['avatar_url']?.toString();
      final coachAvatarUrl = settings['customCoachAvatarUrl']?.toString();
      setState(() {
        _enabled = settings['enabled'] == true;
        _hasKey = settings['hasApiKey'] == true;
        _serverEncryptionReady = settings['serverEncryptionReady'] == true;
        _baseUrl.text = settings['baseUrl']?.toString() ?? _baseUrl.text;
        _model.text = settings['model']?.toString() ?? '';
        _mode = settings['coachMode']?.toString() ?? 'friend';
        _customPrompt.text = settings['customCoachPrompt']?.toString() ?? '';
        _customCoachName.text = settings['customCoachName']?.toString() ?? '';
        _shareUserName = settings['shareUserName'] == true;
        _chatHistoryLimit =
            (settings['chatHistoryLimit'] as num?)?.toInt() ?? 20;
        _reports = values[1] as List<dynamic>;
        _messages = values[2] as List<dynamic>;
        _memory.text = memory['summary']?.toString() ?? '';
        _memoryUpdatedAt = memory['updatedAt']?.toString();
        _customCoachAvatarUrl = coachAvatarUrl;
        _error = null;
      });
      final avatars = await Future.wait([
        _loadAvatarBytes(userAvatarUrl),
        _loadAvatarBytes(coachAvatarUrl),
      ]);
      if (mounted) {
        setState(() {
          _userAvatarBytes = avatars[0];
          _customCoachAvatarBytes = avatars[1];
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = _errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _errorText(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      final serverMessage = data is Map ? data['error'] : null;
      if (serverMessage is String && serverMessage.trim().isNotEmpty) {
        return serverMessage;
      }
      if (data is String && data.trim().isNotEmpty && data.trim() != 'true') {
        return data.trim();
      }
      final status = error.response?.statusCode;
      if (status != null) {
        return 'The server returned HTTP $status without a useful error message. Check the Forma server logs.';
      }
      return error.message ?? 'Request failed.';
    }
    return error.toString();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _notice = null;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _error = _errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<Map<String, dynamic>> _persistSettings() async {
    final payload = <String, dynamic>{
      'enabled': _enabled,
      'baseUrl': _baseUrl.text.trim(),
      'model': _model.text.trim(),
      'coachMode': _mode,
      'customCoachPrompt': _customPrompt.text,
      'customCoachName': _customCoachName.text.trim(),
      'shareUserName': _shareUserName,
      'chatHistoryLimit': _chatHistoryLimit,
    };
    if (_key.text.trim().isNotEmpty) payload['apiKey'] = _key.text.trim();
    final settings = await widget.api.put('/ai/settings', payload);
    if (mounted) {
      setState(() {
        _hasKey = settings['hasApiKey'] == true;
        _serverEncryptionReady = settings['serverEncryptionReady'] == true;
        _key.clear();
      });
    }
    return settings;
  }

  Future<void> _save() => _run(() async {
        await _persistSettings();
        if (mounted) setState(() => _notice = 'AI settings saved.');
      });

  String get _selectedCoachName => switch (_mode) {
        'experienced' => 'Coach Marcus',
        'edgy' => 'Coach Diesel',
        'custom' => _customCoachName.text.trim().isEmpty
            ? 'My Coach'
            : _customCoachName.text.trim(),
        _ => 'Alex',
      };

  Future<void> _fetchModels() => _run(() async {
        final payload = <String, dynamic>{'baseUrl': _baseUrl.text.trim()};
        if (_key.text.trim().isNotEmpty) payload['apiKey'] = _key.text.trim();
        final result = await widget.api.post('/ai/models', payload);
        final models = (result['models'] as List<dynamic>? ?? const [])
            .whereType<String>()
            .toList();
        if (models.isEmpty) {
          throw StateError(
              'The provider returned no models. You can still enter a model ID manually.');
        }
        if (mounted) {
          setState(() {
            _models = models;
            _notice =
                'Loaded ${models.length} models. Select one, then save settings.';
          });
        }
      });

  Future<void> _test() => _run(() async {
        if (_baseUrl.text.trim().isEmpty || _model.text.trim().isEmpty) {
          throw StateError('Enter an API base URL and model before testing.');
        }
        if (!_hasKey && _key.text.trim().isEmpty) {
          throw StateError('Enter an API token before testing the provider.');
        }
        await _persistSettings();
        await widget.api.post('/ai/test', {});
        if (mounted) setState(() => _notice = 'Provider connection succeeded.');
      });

  Future<void> _generateReport() => _run(() async {
        await widget.api.postWithTimeout(
          '/ai/weekly-report',
          {},
          timeout: const Duration(seconds: 130),
        );
        final reports = await widget.api.getDynamicList('/ai/weekly-reports');
        if (mounted) {
          setState(() {
            _reports = reports;
            _notice = 'Weekly report generated.';
          });
        }
      });

  Future<void> _deleteReport(Map<String, dynamic> report) async {
    final id = report['id']?.toString();
    if (id == null || id.isEmpty) return;
    final from = report['weekStart']?.toString() ?? '';
    final to = report['weekEnd']?.toString() ?? '';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete weekly report?'),
        content: Text(
          from.isEmpty
              ? 'This report will be permanently deleted.'
              : 'Delete the report for $from – $to?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton.tonalIcon(
            onPressed: () => Navigator.pop(context, true),
            icon: const Icon(Icons.delete_outline),
            label: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _run(() async {
      await widget.api.delete('/ai/weekly-reports/$id');
      if (mounted) {
        setState(() {
          _reports.removeWhere((item) => item is Map && item['id'] == id);
          _notice = 'Weekly report deleted.';
        });
      }
    });
  }

  Future<void> _sendMessage() async {
    if (_busy) return;
    final message = _message.text.trim();
    if (message.isEmpty) return;
    await _run(() async {
      final result = await widget.api.postWithTimeout(
        '/ai/chat',
        {'message': message},
        timeout: const Duration(seconds: 130),
      );
      if (mounted) {
        setState(() => _messages = [
              ..._messages,
              {
                'id': result['userMessageId'],
                'role': 'user',
                'content': message,
              },
              result
            ]);
        _message.clear();
      }
    });
  }

  bool _isLastUserMessage(Map<String, dynamic> message) {
    final lastUser = _messages.lastWhere(
      (item) => item is Map && item['role'] == 'user',
      orElse: () => null,
    );
    return lastUser is Map &&
        lastUser['id'] != null &&
        lastUser['id'] == message['id'];
  }

  Future<void> _copyMessage(Map<String, dynamic> message) async {
    await Clipboard.setData(
      ClipboardData(text: message['content']?.toString() ?? ''),
    );
    if (mounted) setState(() => _notice = 'Message copied.');
  }

  Future<void> _deleteMessage(Map<String, dynamic> message) async {
    final id = message['id']?.toString();
    if (id == null || id.isEmpty) return;
    final user = message['role'] == 'user';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete message?'),
        content: Text(user
            ? 'This will also remove the coach reply to this message.'
            : 'This removes the coach reply from your chat history.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton.tonal(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    await _run(() async {
      await widget.api.delete('/ai/chat/${Uri.encodeComponent(id)}');
      final messages = await widget.api.getList('/ai/chat');
      if (mounted) {
        setState(() {
          _messages = messages;
          _notice = 'Message deleted.';
        });
      }
    });
  }

  Future<void> _editLastMessage(Map<String, dynamic> message) async {
    final id = message['id']?.toString();
    if (id == null || id.isEmpty || !_isLastUserMessage(message)) return;
    final controller = TextEditingController(
      text: message['content']?.toString() ?? '',
    );
    final updated = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit your message'),
        content: SizedBox(
          width: 480,
          child: TextField(
            controller: controller,
            autofocus: true,
            minLines: 2,
            maxLines: 8,
            maxLength: 4000,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            icon: const Icon(Icons.auto_awesome),
            label: const Text('Save & regenerate'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (updated == null || updated.isEmpty || !mounted) return;
    await _run(() async {
      await widget.api.putWithTimeout(
        '/ai/chat/${Uri.encodeComponent(id)}',
        {'message': updated},
        timeout: const Duration(seconds: 130),
      );
      final messages = await widget.api.getList('/ai/chat');
      if (mounted) {
        setState(() {
          _messages = messages;
          _notice = 'Message updated and the coach reply regenerated.';
        });
      }
    });
  }

  Future<void> _editAssistantMessage(Map<String, dynamic> message) async {
    final id = message['id']?.toString();
    if (id == null || id.isEmpty || _mode != 'custom') return;
    final controller = TextEditingController(
      text: message['content']?.toString() ?? '',
    );
    final updated = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Edit coach reply'),
        content: SizedBox(
          width: 520,
          child: TextField(
            controller: controller,
            autofocus: true,
            minLines: 3,
            maxLines: 12,
            maxLength: 4000,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            icon: const Icon(Icons.save_outlined),
            label: const Text('Save reply'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (updated == null || updated.isEmpty || !mounted) return;
    await _run(() async {
      await widget.api.put('/ai/chat/${Uri.encodeComponent(id)}', {
        'content': updated,
      });
      final messages = await widget.api.getList('/ai/chat');
      if (mounted) {
        setState(() {
          _messages = messages;
          _notice = 'Coach reply updated.';
        });
      }
    });
  }

  Widget _messageActions(Map<String, dynamic> message) =>
      PopupMenuButton<String>(
        tooltip: 'Message actions',
        padding: EdgeInsets.zero,
        iconSize: 19,
        icon: const Icon(Icons.more_horiz),
        onSelected: (action) {
          switch (action) {
            case 'copy':
              _copyMessage(message);
              break;
            case 'edit':
              if (message['role'] == 'assistant') {
                _editAssistantMessage(message);
              } else {
                _editLastMessage(message);
              }
              break;
            case 'delete':
              _deleteMessage(message);
              break;
          }
        },
        itemBuilder: (context) => [
          const PopupMenuItem(
            value: 'copy',
            child: ListTile(
              leading: Icon(Icons.copy_outlined),
              title: Text('Copy'),
              contentPadding: EdgeInsets.zero,
              dense: true,
            ),
          ),
          if (message['role'] == 'user' && _isLastUserMessage(message))
            const PopupMenuItem(
              value: 'edit',
              child: ListTile(
                leading: Icon(Icons.edit_outlined),
                title: Text('Edit & regenerate'),
                contentPadding: EdgeInsets.zero,
                dense: true,
              ),
            ),
          if (message['role'] == 'assistant' && _mode == 'custom')
            const PopupMenuItem(
              value: 'edit',
              child: ListTile(
                leading: Icon(Icons.edit_outlined),
                title: Text('Edit reply'),
                contentPadding: EdgeInsets.zero,
                dense: true,
              ),
            ),
          const PopupMenuItem(
            value: 'delete',
            child: ListTile(
              leading: Icon(Icons.delete_outline),
              title: Text('Delete'),
              contentPadding: EdgeInsets.zero,
              dense: true,
            ),
          ),
        ],
      );

  Future<void> _clearChat() => _run(() async {
        await widget.api.delete('/ai/chat');
        if (mounted) {
          setState(() {
            _messages = [];
            _notice = 'Chat history cleared.';
          });
        }
      });

  Future<void> _saveMemory() => _run(() async {
        final memory = await widget.api.put('/ai/chat/memory', {
          'summary': _memory.text,
        });
        if (mounted) {
          setState(() {
            _memoryUpdatedAt = memory['updatedAt']?.toString();
            _notice = 'Conversation memory saved.';
          });
        }
      });

  Future<void> _generateMemory() => _run(() async {
        final memory = await widget.api.postWithTimeout(
          '/ai/chat/memory/generate',
          {},
          timeout: const Duration(seconds: 130),
        );
        if (mounted) {
          setState(() {
            _memory.text = memory['summary']?.toString() ?? '';
            _memoryUpdatedAt = memory['updatedAt']?.toString();
            _notice =
                'Memory generated. Review or edit it, then save your changes.';
          });
        }
      });

  Future<Uint8List?> _loadAvatarBytes(String? avatarUrl) async {
    if (avatarUrl == null || avatarUrl.isEmpty) return null;
    final apiPath = avatarUrl.startsWith('/api/')
        ? avatarUrl.substring('/api'.length)
        : avatarUrl;
    try {
      final bytes = await widget.api.getBytes(apiPath);
      return bytes.isEmpty ? null : Uint8List.fromList(bytes);
    } catch (_) {
      return null;
    }
  }

  Future<void> _uploadCoachAvatar() async {
    final image = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 88,
      maxWidth: 640,
      maxHeight: 640,
    );
    if (image == null) return;
    await _run(() async {
      final bytes = await image.readAsBytes();
      final result = await widget.api.dio.post(
        '/ai/coach-avatar',
        data: FormData.fromMap({
          'file': MultipartFile.fromBytes(bytes, filename: image.name),
        }),
      );
      if (!mounted) return;
      setState(() {
        _customCoachAvatarUrl =
            (result.data as Map)['coachAvatarUrl']?.toString();
        _customCoachAvatarBytes = bytes;
      });
    });
  }

  Future<void> _removeCoachAvatar() => _run(() async {
        await widget.api.delete('/ai/coach-avatar');
        if (mounted) {
          setState(() {
            _customCoachAvatarUrl = null;
            _customCoachAvatarBytes = null;
            _notice = 'Custom coach avatar removed.';
          });
        }
      });

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
            title: MediaQuery.sizeOf(context).width < 600
                ? null
                : const Text('AI coach & reports'),
            bottom: TabBar(controller: _tabs, tabs: const [
              Tab(text: 'Coach'),
              Tab(text: 'Weekly report'),
              Tab(text: 'Setup')
            ])),
        body: Column(children: [
          if (_error != null)
            MaterialBanner(content: Text(_error!), actions: [
              TextButton(
                  onPressed: () => setState(() => _error = null),
                  child: const Text('Dismiss'))
            ]),
          if (_notice != null)
            MaterialBanner(content: Text(_notice!), actions: [
              TextButton(
                  onPressed: () => setState(() => _notice = null),
                  child: const Text('OK'))
            ]),
          if (_busy) const LinearProgressIndicator(),
          Expanded(
              child: TabBarView(
                  controller: _tabs,
                  children: [_coachTab(), _reportTab(), _setupTab()])),
        ]),
      );

  Widget _setupTab() => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 880),
          child: ListView(padding: const EdgeInsets.all(24), children: [
            const _InfoCard(
                text:
                    'AI is optional and uses your own provider account. When you generate a report or chat, Forma sends relevant health records to the configured AI provider. Your display name is excluded by default; in Custom mode you can choose to share it. Username, biography, and photos stay excluded. Provider terms and retention policies still apply.'),
            const SizedBox(height: 16),
            const _InfoCard(
                text:
                    'The coach can use your weight, measurements, goals, nutrition, fasting, and relevant settings. Names and photos are excluded.'),
            const SizedBox(height: 16),
            if (!_serverEncryptionReady)
              const Padding(
                padding: EdgeInsets.only(bottom: 16),
                child: _InfoCard(
                    text:
                        'The Forma server cannot use FORMA_AI_ENCRYPTION_KEY. Check that the running container received a valid base64 key that decodes to 32 bytes, then recreate the container.'),
              ),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _SetupSectionHeader(
                      icon: Icons.hub_outlined,
                      title: 'Provider connection',
                      subtitle:
                          'Connect your AI provider and choose the model Forma should use.',
                    ),
                    const SizedBox(height: 12),
                    SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Enable AI features'),
                        subtitle: const Text(
                            'Turn this on after saving a provider and model.'),
                        value: _enabled,
                        onChanged: (value) => setState(() => _enabled = value)),
                    const SizedBox(height: 16),
                    TextField(
                        controller: _baseUrl,
                        decoration: const InputDecoration(
                            labelText: 'API base URL',
                            hintText: 'https://api.openai.com/v1',
                            border: OutlineInputBorder())),
                    const SizedBox(height: 16),
                    Autocomplete<String>(
                      textEditingController: _model,
                      optionsBuilder: (value) {
                        final query = value.text.trim().toLowerCase();
                        return _models
                            .where(
                                (model) => model.toLowerCase().contains(query))
                            .take(100);
                      },
                      onSelected: (model) => _model.text = model,
                      fieldViewBuilder:
                          (context, controller, focusNode, onFieldSubmitted) =>
                              TextField(
                        controller: controller,
                        focusNode: focusNode,
                        onSubmitted: (_) => onFieldSubmitted(),
                        decoration: InputDecoration(
                          labelText: 'Model',
                          hintText: 'Select a provider model or enter an ID',
                          border: const OutlineInputBorder(),
                          suffixIcon: IconButton(
                            tooltip: 'Load available models',
                            onPressed: _busy ? null : _fetchModels,
                            icon: const Icon(
                                Icons.arrow_drop_down_circle_outlined),
                          ),
                        ),
                      ),
                      optionsViewBuilder: (context, onSelected, options) =>
                          Align(
                        alignment: Alignment.topLeft,
                        child: Material(
                          elevation: 4,
                          child: ConstrainedBox(
                            constraints: const BoxConstraints(
                                maxHeight: 280, maxWidth: 600),
                            child: ListView.builder(
                              padding: EdgeInsets.zero,
                              shrinkWrap: true,
                              itemCount: options.length,
                              itemBuilder: (context, index) {
                                final model = options.elementAt(index);
                                return ListTile(
                                  dense: true,
                                  title: Text(model),
                                  onTap: () => onSelected(model),
                                );
                              },
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextField(
                        controller: _key,
                        obscureText: true,
                        autofillHints: const [AutofillHints.password],
                        decoration: InputDecoration(
                            labelText: _hasKey
                                ? 'API token (saved; enter to replace)'
                                : 'API token',
                            helperText:
                                'Stored encrypted on your Forma server. Never returned to the app.',
                            border: const OutlineInputBorder())),
                    const SizedBox(height: 20),
                    Wrap(spacing: 10, runSpacing: 8, children: [
                      FilledButton.icon(
                          onPressed: _busy ? null : _save,
                          icon: const Icon(Icons.save_outlined),
                          label: const Text('Save settings')),
                      OutlinedButton.icon(
                          onPressed: _busy ? null : _test,
                          icon: const Icon(Icons.wifi_tethering),
                          label: const Text('Test provider')),
                      if (_hasKey)
                        TextButton.icon(
                            onPressed: _busy
                                ? null
                                : () => _run(() async {
                                      await widget.api
                                          .delete('/ai/settings/key');
                                      if (mounted) {
                                        setState(() {
                                          _hasKey = false;
                                          _enabled = false;
                                          _notice = 'Provider token removed.';
                                        });
                                      }
                                    }),
                            icon: const Icon(Icons.key_off),
                            label: const Text('Remove token'))
                    ]),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _SetupSectionHeader(
                      icon: Icons.tune_rounded,
                      title: 'Chat & coach',
                      subtitle:
                          'Choose how much conversation context to send and set the coach’s voice.',
                    ),
                    const SizedBox(height: 20),
                    Text('Conversation context',
                        style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<int>(
                      initialValue: _chatHistoryLimit,
                      decoration: const InputDecoration(
                        labelText: 'Recent messages sent to the coach',
                        helperText:
                            'More messages give the coach more context and use more provider tokens.',
                        border: OutlineInputBorder(),
                      ),
                      items: const [4, 8, 12, 20, 30, 50, 100]
                          .map((count) => DropdownMenuItem(
                                value: count,
                                child: Text('$count messages'),
                              ))
                          .toList(),
                      onChanged: (value) => setState(
                          () => _chatHistoryLimit = value ?? _chatHistoryLimit),
                    ),
                    const SizedBox(height: 24),
                    Text('Coach personality',
                        style: Theme.of(context).textTheme.titleSmall),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                        initialValue: _mode,
                        decoration: const InputDecoration(
                            labelText: 'Coach personality',
                            border: OutlineInputBorder()),
                        items: const [
                          DropdownMenuItem(
                              value: 'experienced',
                              child: Text('Experienced gym coach · Marcus')),
                          DropdownMenuItem(
                              value: 'friend',
                              child: Text('Expert friend · Alex')),
                          DropdownMenuItem(
                              value: 'edgy',
                              child: Text('Edgy gym coach · Diesel')),
                          DropdownMenuItem(
                              value: 'custom', child: Text('Custom prompt'))
                        ],
                        onChanged: (value) =>
                            setState(() => _mode = value ?? 'friend')),
                    if (_mode == 'custom')
                      Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: TextField(
                            controller: _customCoachName,
                            maxLength: 48,
                            decoration: const InputDecoration(
                              labelText: 'Coach name',
                              hintText: 'For example, Taylor',
                              helperText:
                                  'Shown above your coach’s messages. Defaults to My Coach.',
                              border: OutlineInputBorder(),
                            ),
                          )),
                    if (_mode == 'custom')
                      Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: TextField(
                              controller: _customPrompt,
                              minLines: 4,
                              maxLines: 10,
                              maxLength: 8000,
                              decoration: const InputDecoration(
                                  labelText: 'Your coach system prompt',
                                  alignLabelWithHint: true,
                                  helperText:
                                      'Custom mode uses your prompt without Forma’s preset coach instructions.',
                                  hintText:
                                      'Write the system prompt you want the coach to follow.',
                                  border: OutlineInputBorder()))),
                    if (_mode == 'custom')
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        value: _shareUserName,
                        onChanged: (value) =>
                            setState(() => _shareUserName = value),
                        title: const Text('Share my display name with AI'),
                        subtitle: const Text(
                          'Includes your profile display name in coach chats and weekly reports. Your username stays private.',
                        ),
                      ),
                    if (_mode == 'custom') ...[
                      const SizedBox(height: 12),
                      Row(children: [
                        _ChatAvatar(
                          coachMode: 'custom',
                          imageBytes: _customCoachAvatarBytes,
                        ),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Text(
                              'Custom coach avatar. Shown in chat only; never sent to your AI provider.'),
                        ),
                        OutlinedButton.icon(
                          onPressed: _busy ? null : _uploadCoachAvatar,
                          icon: const Icon(Icons.upload_outlined),
                          label: Text(_customCoachAvatarUrl == null
                              ? 'Upload'
                              : 'Change'),
                        ),
                        if (_customCoachAvatarUrl != null)
                          IconButton(
                            tooltip: 'Remove custom coach avatar',
                            onPressed: _busy ? null : _removeCoachAvatar,
                            icon: const Icon(Icons.delete_outline),
                          ),
                      ]),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _SetupSectionHeader(
                      icon: Icons.psychology_alt_outlined,
                      title: 'Conversation memory',
                      subtitle:
                          'Give your coach durable context across conversations. Review and edit it whenever you like.',
                    ),
                    const SizedBox(height: 14),
                    if (_memoryUpdatedAt != null) ...[
                      const SizedBox(height: 6),
                      Text('Last saved: $_memoryUpdatedAt',
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                    const SizedBox(height: 14),
                    TextField(
                      controller: _memory,
                      minLines: 5,
                      maxLines: 12,
                      maxLength: 12000,
                      decoration: InputDecoration(
                        labelText: 'What the coach should remember',
                        alignLabelWithHint: true,
                        hintText:
                            'Add goals, preferences, equipment, constraints, or ongoing plans.',
                        border: const OutlineInputBorder(),
                        filled: true,
                        fillColor: Theme.of(context)
                            .colorScheme
                            .surfaceContainerLowest,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(spacing: 10, runSpacing: 8, children: [
                      FilledButton.icon(
                        onPressed: _busy ? null : _saveMemory,
                        icon: const Icon(Icons.save_outlined),
                        label: const Text('Save memory'),
                      ),
                      OutlinedButton.icon(
                        onPressed: _busy || _messages.length < 4
                            ? null
                            : _generateMemory,
                        icon: const Icon(Icons.auto_awesome_outlined),
                        label: const Text('Generate / update from chat'),
                      ),
                      TextButton.icon(
                        onPressed: _busy ? null : _clearChat,
                        icon: const Icon(Icons.delete_outline),
                        label: const Text('Clear chat history'),
                      ),
                    ]),
                    if (_messages.length < 4)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'Chat with the coach a little more to enable memory generation (${_messages.length}/4 messages).',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ]),
        ),
      );

  Widget _reportTab() => Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 1080),
          child: ListView(padding: const EdgeInsets.all(24), children: [
            const _InfoCard(
                text:
                    'Generate a report for the latest 7 days and compare it with the previous 7 days. Reports are created only when you request them.'),
            const SizedBox(height: 16),
            FilledButton.icon(
                onPressed: _busy ? null : _generateReport,
                icon: const Icon(Icons.auto_awesome),
                label: const Text('Generate this week’s report')),
            const SizedBox(height: 18),
            if (_reports.isEmpty)
              const Center(
                  child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('No reports yet.'))),
            for (final item in _reports) ...[
              _ReportCard(
                item: Map<String, dynamic>.from(item),
                onDelete: _busy
                    ? null
                    : () => _deleteReport(Map<String, dynamic>.from(item)),
              ),
              const SizedBox(height: 14),
            ],
          ]),
        ),
      );

  Widget _coachTab() => Column(children: [
        Expanded(
            child: _messages.isEmpty
                ? const Center(
                    child: Text(
                        'Ask about training, building a routine, or your progress.'))
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final message =
                          Map<String, dynamic>.from(_messages[index] as Map);
                      final user = message['role'] == 'user';
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Row(
                          mainAxisAlignment: user
                              ? MainAxisAlignment.end
                              : MainAxisAlignment.start,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (user) _messageActions(message),
                            if (!user) ...[
                              _ChatAvatar(
                                coachMode: _mode,
                                imageBytes: _mode == 'custom'
                                    ? _customCoachAvatarBytes
                                    : null,
                              ),
                              const SizedBox(width: 8),
                            ],
                            Flexible(
                              child: ConstrainedBox(
                                constraints:
                                    const BoxConstraints(maxWidth: 680),
                                child: Column(
                                  crossAxisAlignment: user
                                      ? CrossAxisAlignment.end
                                      : CrossAxisAlignment.start,
                                  children: [
                                    Padding(
                                      padding: const EdgeInsets.only(
                                          left: 12, right: 12, bottom: 4),
                                      child: Text(
                                        user ? 'You' : _selectedCoachName,
                                        style: Theme.of(context)
                                            .textTheme
                                            .labelMedium
                                            ?.copyWith(
                                              color: Theme.of(context)
                                                  .colorScheme
                                                  .onSurfaceVariant,
                                            ),
                                      ),
                                    ),
                                    Card(
                                      margin: EdgeInsets.zero,
                                      color: user
                                          ? Theme.of(context)
                                              .colorScheme
                                              .primaryContainer
                                          : null,
                                      child: Padding(
                                        padding: const EdgeInsets.all(14),
                                        child: SelectableText(
                                            message['content']?.toString() ??
                                                ''),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            if (!user) _messageActions(message),
                            if (user) ...[
                              const SizedBox(width: 8),
                              _ChatAvatar(
                                isUser: true,
                                imageBytes: _userAvatarBytes,
                              ),
                            ],
                          ],
                        ),
                      );
                    })),
        SafeArea(
            top: false,
            child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  Expanded(
                      child: Focus(
                    onKeyEvent: (node, event) {
                      if (event is KeyDownEvent &&
                          event.logicalKey == LogicalKeyboardKey.enter &&
                          !HardwareKeyboard.instance.isShiftPressed) {
                        _sendMessage();
                        return KeyEventResult.handled;
                      }
                      return KeyEventResult.ignored;
                    },
                    child: TextField(
                      controller: _message,
                      readOnly: _busy,
                      minLines: 1,
                      maxLines: 4,
                      decoration: const InputDecoration(
                          hintText: 'Message your coach',
                          border: OutlineInputBorder()),
                    ),
                  )),
                  const SizedBox(width: 8),
                  IconButton.filled(
                      onPressed: _busy ? null : _sendMessage,
                      icon: const Icon(Icons.send))
                ]))),
      ]);
}

class _ChatAvatar extends StatelessWidget {
  const _ChatAvatar({
    this.isUser = false,
    this.coachMode = 'friend',
    this.imageBytes,
  });

  final bool isUser;
  final String coachMode;
  final Uint8List? imageBytes;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final (background, foreground, icon) = isUser
        ? (
            colorScheme.tertiaryContainer,
            colorScheme.onTertiaryContainer,
            Icons.person_rounded,
          )
        : switch (coachMode) {
            'experienced' => (
                const Color(0xff304A78),
                Colors.white,
                Icons.fitness_center_rounded,
              ),
            'edgy' => (
                const Color(0xff8E3F91),
                Colors.white,
                Icons.bolt_rounded,
              ),
            'custom' => (
                colorScheme.secondaryContainer,
                colorScheme.onSecondaryContainer,
                Icons.auto_awesome_rounded,
              ),
            _ => (
                const Color(0xffC46E50),
                Colors.white,
                Icons.waving_hand_rounded,
              ),
          };
    return SizedBox(
      width: 38,
      height: 38,
      child: Stack(clipBehavior: Clip.none, children: [
        CircleAvatar(
          radius: 18,
          backgroundColor: background,
          child: imageBytes == null
              ? Icon(icon, size: 19, color: foreground)
              : ClipOval(
                  child: Image.memory(
                    imageBytes!,
                    width: 36,
                    height: 36,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Icon(
                      icon,
                      size: 19,
                      color: foreground,
                    ),
                  ),
                ),
        ),
        if (!isUser && coachMode != 'custom')
          Positioned(
            right: -1,
            bottom: -1,
            child: Container(
              width: 13,
              height: 13,
              decoration: BoxDecoration(
                color: colorScheme.surface,
                shape: BoxShape.circle,
              ),
              child:
                  Icon(Icons.auto_awesome_rounded, size: 9, color: foreground),
            ),
          ),
      ]),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.info_outline),
            const SizedBox(width: 12),
            Expanded(child: Text(text))
          ])));
}

class _SetupSectionHeader extends StatelessWidget {
  const _SetupSectionHeader({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      CircleAvatar(
        radius: 20,
        backgroundColor: colors.primaryContainer,
        foregroundColor: colors.onPrimaryContainer,
        child: Icon(icon, size: 20),
      ),
      const SizedBox(width: 14),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 3),
          Text(
            subtitle,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: colors.onSurfaceVariant,
                ),
          ),
        ]),
      ),
    ]);
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.item, this.onDelete});
  final Map<String, dynamic> item;
  final VoidCallback? onDelete;
  @override
  Widget build(BuildContext context) {
    final from = item['weekStart']?.toString() ?? '';
    final to = item['weekEnd']?.toString() ?? '';
    final dateRange = from.isEmpty ? 'Weekly report' : '$from – $to';
    return Card(
        child: Padding(
      padding: const EdgeInsets.all(22),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          CircleAvatar(
            backgroundColor: Theme.of(context).colorScheme.primaryContainer,
            foregroundColor: Theme.of(context).colorScheme.onPrimaryContainer,
            child: const Icon(Icons.insights_outlined),
          ),
          const SizedBox(width: 14),
          Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Weekly progress',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 2),
              Text(dateRange,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      )),
            ]),
          ),
          if (onDelete != null)
            IconButton(
              tooltip: 'Delete report',
              onPressed: onDelete,
              icon: const Icon(Icons.delete_outline),
            )
          else
            Icon(Icons.calendar_month_outlined,
                color: Theme.of(context).colorScheme.onSurfaceVariant),
        ]),
        const SizedBox(height: 18),
        const Divider(height: 1),
        const SizedBox(height: 18),
        _ReportMarkdown(content: item['content']?.toString() ?? ''),
      ]),
    ));
  }
}

class _ReportMarkdown extends StatelessWidget {
  const _ReportMarkdown({required this.content});
  final String content;

  @override
  Widget build(BuildContext context) {
    final lines = content.replaceAll('\r\n', '\n').split('\n');
    final blocks = <Widget>[];
    var index = 0;
    while (index < lines.length) {
      final line = lines[index].trim();
      if (line.isEmpty) {
        index++;
        continue;
      }

      if (_isTableLine(line) &&
          index + 1 < lines.length &&
          _isTableDivider(lines[index + 1])) {
        final rows = <List<String>>[_tableCells(line)];
        index += 2;
        while (index < lines.length && _isTableLine(lines[index].trim())) {
          rows.add(_tableCells(lines[index].trim()));
          index++;
        }
        blocks.add(_ReportTable(rows: rows));
        blocks.add(const SizedBox(height: 16));
        continue;
      }

      final heading = RegExp(r'^#{1,3}\s+').firstMatch(line);
      if (heading != null) {
        final level = heading.group(0)!.trim().length;
        blocks.add(Text(
          _stripInlineMarkdown(line.substring(heading.end)),
          style: level == 1
              ? Theme.of(context).textTheme.titleLarge
              : Theme.of(context).textTheme.titleMedium,
        ));
        blocks.add(const SizedBox(height: 8));
        index++;
        continue;
      }

      final bullet = RegExp(r'^(?:[-*])\s+').firstMatch(line);
      final numbered = RegExp(r'^\d+[.)]\s+').firstMatch(line);
      if (bullet != null || numbered != null) {
        final prefix = bullet ?? numbered!;
        final marker =
            bullet != null ? '•' : line.substring(0, prefix.end).trim();
        blocks.add(Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(
              width: 28,
              child: Text(marker,
                  style: TextStyle(
                      color: Theme.of(context).colorScheme.primary,
                      fontWeight: FontWeight.w600)),
            ),
            Expanded(child: _reportText(line.substring(prefix.end))),
          ]),
        ));
        index++;
        continue;
      }

      if (line.startsWith('>')) {
        blocks.add(Container(
          width: double.infinity,
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(10),
            border: Border(
              left: BorderSide(
                  color: Theme.of(context).colorScheme.primary, width: 3),
            ),
          ),
          child: _reportText(line.substring(1).trim()),
        ));
        index++;
        continue;
      }

      final paragraph = <String>[line];
      index++;
      while (index < lines.length &&
          lines[index].trim().isNotEmpty &&
          !_startsStructuredBlock(lines, index)) {
        paragraph.add(lines[index].trim());
        index++;
      }
      blocks.add(_reportText(paragraph.join(' ')));
      blocks.add(const SizedBox(height: 10));
    }
    return Column(
        crossAxisAlignment: CrossAxisAlignment.start, children: blocks);
  }
}

class _ReportTable extends StatelessWidget {
  const _ReportTable({required this.rows});
  final List<List<String>> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();
    final count = rows.map((row) => row.length).reduce((a, b) => a > b ? a : b);
    final widths = <int, TableColumnWidth>{
      for (var i = 0; i < count; i++) i: FlexColumnWidth(i == 0 ? 1.25 : 1),
    };
    final table = Table(
      columnWidths: widths,
      border: TableBorder(
        horizontalInside:
            BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      children: [
        for (var rowIndex = 0; rowIndex < rows.length; rowIndex++)
          TableRow(
            decoration: rowIndex == 0
                ? BoxDecoration(
                    color:
                        Theme.of(context).colorScheme.surfaceContainerHighest)
                : rowIndex.isEven
                    ? BoxDecoration(
                        color:
                            Theme.of(context).colorScheme.surfaceContainerLow)
                    : null,
            children: [
              for (var column = 0; column < count; column++)
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                  child: _reportText(
                    column < rows[rowIndex].length
                        ? rows[rowIndex][column]
                        : '',
                    style: rowIndex == 0
                        ? Theme.of(context).textTheme.labelLarge?.copyWith(
                            color: Theme.of(context).colorScheme.primary)
                        : null,
                  ),
                ),
            ],
          ),
      ],
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth.isFinite && constraints.maxWidth < 640) {
          final headers = rows.first;
          final colors = Theme.of(context).colorScheme;
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final row in rows.skip(1))
                Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: colors.surfaceContainerLow,
                    border: Border.all(color: colors.outlineVariant),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _reportText(
                        row.isNotEmpty ? row.first : '',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                              color: colors.primary,
                            ),
                      ),
                      for (var column = 1; column < count; column++) ...[
                        const SizedBox(height: 10),
                        Text(
                          column < headers.length ? headers[column] : '',
                          style: Theme.of(context)
                              .textTheme
                              .labelMedium
                              ?.copyWith(color: colors.onSurfaceVariant),
                        ),
                        const SizedBox(height: 2),
                        _reportText(
                          column < row.length ? row[column] : '',
                        ),
                      ],
                    ],
                  ),
                ),
            ],
          );
        }
        final tableWidth = constraints.maxWidth.isFinite
            ? constraints.maxWidth.clamp(620.0, 1080.0).toDouble()
            : 900.0;
        return Container(
          width: double.infinity,
          clipBehavior: Clip.antiAlias,
          decoration: BoxDecoration(
            border:
                Border.all(color: Theme.of(context).colorScheme.outlineVariant),
            borderRadius: BorderRadius.circular(12),
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: SizedBox(width: tableWidth, child: table),
          ),
        );
      },
    );
  }
}

bool _isTableLine(String line) => line.startsWith('|') && line.endsWith('|');

bool _isTableDivider(String line) =>
    _isTableLine(line.trim()) &&
    _tableCells(line).every((cell) => RegExp(r'^:?-{3,}:?$').hasMatch(cell));

List<String> _tableCells(String line) => line
    .trim()
    .replaceFirst(RegExp(r'^\|'), '')
    .replaceFirst(RegExp(r'\|$'), '')
    .split('|')
    .map((cell) => cell.trim())
    .toList();

bool _startsStructuredBlock(List<String> lines, int index) {
  final line = lines[index].trim();
  return RegExp(r'^(?:#{1,3}\s+|[-*]\s+|\d+[.)]\s+|>)').hasMatch(line) ||
      (_isTableLine(line) &&
          index + 1 < lines.length &&
          _isTableDivider(lines[index + 1]));
}

String _stripInlineMarkdown(String text) =>
    text.replaceAll(RegExp(r'[*_`~]'), '');

Widget _reportText(String text, {TextStyle? style}) =>
    Text.rich(_reportSpans(text, style: style));

TextSpan _reportSpans(String text, {TextStyle? style}) {
  final spans = <TextSpan>[];
  final pattern = RegExp(r'(\*\*.+?\*\*|\*[^*]+\*|`[^`]+`)');
  var offset = 0;
  for (final match in pattern.allMatches(text)) {
    if (match.start > offset) {
      spans.add(TextSpan(text: text.substring(offset, match.start)));
    }
    final token = match.group(0)!;
    final strong = token.startsWith('**');
    final code = token.startsWith('`');
    spans.add(TextSpan(
      text: token.substring(strong || code ? (strong ? 2 : 1) : 1,
          token.length - (strong ? 2 : 1)),
      style: TextStyle(
        fontWeight: strong ? FontWeight.w700 : null,
        fontStyle: strong || code ? null : FontStyle.italic,
        fontFamily: code ? 'monospace' : null,
      ),
    ));
    offset = match.end;
  }
  if (offset < text.length) spans.add(TextSpan(text: text.substring(offset)));
  return TextSpan(style: style, children: spans);
}
