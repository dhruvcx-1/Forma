import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'data/api_client.dart';
import 'state/session_state.dart';
import 'state/theme_state.dart';
import 'theme/forma_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy();
  const bakedUrl = String.fromEnvironment('FORMA_API_BASE_URL');
  SharedPreferences? preferences;
  String? selectedUrl = bakedUrl.trim().isNotEmpty ? bakedUrl.trim() : null;
  if (selectedUrl == null && !kIsWeb) {
    preferences = await SharedPreferences.getInstance();
    selectedUrl = preferences.getString('forma_api_base_url');
  }
  if (selectedUrl == null && kIsWeb) selectedUrl = Uri.base.origin;

  if (selectedUrl == null || selectedUrl.isEmpty) {
    runApp(_ServerSetupGate(preferences: preferences));
    return;
  }
  final api = await ApiClient.create(baseUrl: selectedUrl);
  runApp(_formaApp(api));
}

Widget _formaApp(ApiClient api) => MultiProvider(providers: [
      ChangeNotifierProvider(create: (_) => SessionState(api)..restore()),
      ChangeNotifierProvider(create: (_) => ThemeState()..restore()),
    ], child: FormaApp(api: api));

class _ServerSetupGate extends StatefulWidget {
  const _ServerSetupGate({required this.preferences});
  final SharedPreferences? preferences;

  @override
  State<_ServerSetupGate> createState() => _ServerSetupGateState();
}

class _ServerSetupGateState extends State<_ServerSetupGate> {
  final _url = TextEditingController();
  bool _connecting = false;
  String? _error;

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  Future<void> _connect() async {
    final raw = _url.text.trim().replaceFirst(RegExp(r'/+$'), '');
    final uri = Uri.tryParse(raw);
    if (uri == null ||
        !uri.hasAuthority ||
        uri.host.isEmpty ||
        !{'https', 'http'}.contains(uri.scheme) ||
        (uri.scheme == 'http' &&
            uri.host != 'localhost' &&
            uri.host != '127.0.0.1' &&
            uri.host != '10.0.2.2')) {
      setState(() => _error =
          'Enter a valid server address. Use HTTPS for remote servers; HTTP is allowed for local development.');
      return;
    }

    setState(() {
      _connecting = true;
      _error = null;
    });
    try {
      final base =
          raw.endsWith('/api') ? raw.substring(0, raw.length - 4) : raw;
      final api = await ApiClient.create(baseUrl: base);
      await api.getMap('/health');
      await widget.preferences?.setString('forma_api_base_url', base);
      if (!mounted) return;
      runApp(_formaApp(api));
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _connecting = false;
        _error =
            'Could not reach that Forma server. Check the URL and try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Connect to Forma',
        debugShowCheckedModeBanner: false,
        theme: FormaTheme.light,
        darkTheme: FormaTheme.dark,
        themeMode: ThemeMode.system,
        home: Builder(
          builder: (context) => Scaffold(
            body: SafeArea(
              child: LayoutBuilder(
                builder: (context, constraints) => SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: (constraints.maxHeight - 48)
                          .clamp(0, double.infinity),
                    ),
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 520),
                        child: Card(
                          child: Padding(
                            padding: const EdgeInsets.all(28),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(Icons.hub_outlined,
                                    size: 36,
                                    color:
                                        Theme.of(context).colorScheme.primary),
                                const SizedBox(height: 18),
                                Text(
                                  'Connect to your Forma server',
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineSmall
                                      ?.copyWith(fontWeight: FontWeight.w700),
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  'Enter the address of the Forma instance you want to use. Your server address stays on this device.',
                                  style: Theme.of(context).textTheme.bodyMedium,
                                ),
                                const SizedBox(height: 22),
                                TextField(
                                  controller: _url,
                                  keyboardType: TextInputType.url,
                                  autocorrect: false,
                                  enableSuggestions: false,
                                  onSubmitted: (_) =>
                                      _connecting ? null : _connect(),
                                  decoration: const InputDecoration(
                                    labelText: 'Server URL',
                                    hintText: 'https://forma.example.com',
                                    prefixIcon: Icon(Icons.link),
                                  ),
                                ),
                                if (_error != null) ...[
                                  const SizedBox(height: 12),
                                  Text(
                                    _error!,
                                    style: TextStyle(
                                      color:
                                          Theme.of(context).colorScheme.error,
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 18),
                                SizedBox(
                                  width: double.infinity,
                                  child: FilledButton.icon(
                                    onPressed: _connecting ? null : _connect,
                                    icon: _connecting
                                        ? const SizedBox(
                                            width: 18,
                                            height: 18,
                                            child: CircularProgressIndicator(
                                                strokeWidth: 2),
                                          )
                                        : const Icon(Icons.arrow_forward),
                                    label: Text(_connecting
                                        ? 'Connecting…'
                                        : 'Connect to server'),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
}
