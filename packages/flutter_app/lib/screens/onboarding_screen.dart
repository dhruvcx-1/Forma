import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../state/session_state.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, required this.setup});
  final bool setup;
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _form = GlobalKey<FormState>();
  final _username = TextEditingController();
  final _displayName = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _height = TextEditingController(text: '170');
  final _weight = TextEditingController(text: '75');
  final _target = TextEditingController();
  int _step = 0;
  String _sex = 'other',
      _units = 'metric',
      _weightUnit = 'kg',
      _goal = 'maintain';
  String? _error;
  bool _submitting = false, _checkingUsername = false;
  static const _steps = [
    'Account',
    'Name',
    'Profile',
    'Height',
    'Weight',
    'Goal'
  ];

  @override
  void dispose() {
    for (final c in [
      _username,
      _displayName,
      _password,
      _confirm,
      _height,
      _weight,
      _target
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<bool> _validateStep() async {
    if (_step == 0) {
      if (_username.text.trim().length < 3) {
        setState(
            () => _error = 'Choose a username with at least 3 characters.');
        return false;
      }
      if (_password.text.length < 8) {
        setState(() => _error = 'Use a password with at least 8 characters.');
        return false;
      }
      if (_password.text != _confirm.text) {
        setState(() => _error = 'The passwords do not match.');
        return false;
      }
      setState(() {
        _checkingUsername = true;
        _error = null;
      });
      try {
        final api = context.read<SessionState>().api;
        final result = await api.getMap(
            '/auth/check-username?username=${Uri.encodeQueryComponent(_username.text.trim())}');
        if (result['available'] == false || result['exists'] == true) {
          setState(() => _error = 'That username is already in use.');
          return false;
        }
      } catch (_) {
        /* The server remains authoritative when submitting. */
      } finally {
        if (mounted) setState(() => _checkingUsername = false);
      }
    }
    if (_step == 3 &&
        (double.tryParse(_height.text) == null ||
            double.parse(_height.text) < 80 ||
            double.parse(_height.text) > 250)) {
      setState(() => _error = 'Enter a height between 80 and 250 cm.');
      return false;
    }
    if (_step == 4 &&
        (double.tryParse(_weight.text) == null ||
            double.parse(_weight.text) < 20 ||
            double.parse(_weight.text) > 500)) {
      setState(() => _error = 'Enter a valid starting weight.');
      return false;
    }
    setState(() => _error = null);
    return true;
  }

  Future<void> _next() async {
    if (!await _validateStep() || !mounted) return;
    if (_step < _steps.length - 1) {
      setState(() => _step++);
      return;
    }
    await _finish();
  }

  Future<void> _finish() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    final session = context.read<SessionState>();
    final ok = await session.signIn(_username.text, _password.text,
        setup: widget.setup,
        register: !widget.setup,
        displayName: _displayName.text);
    if (!ok) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error = session.error ?? 'Could not create the account.';
        });
      }
      return;
    }
    final api = session.api;
    try {
      await api.put('/settings',
          {'unit_system': _units, 'height_cm': _height.text, 'sex': _sex});
    } catch (_) {}
    final weight = double.tryParse(_weight.text);
    if (weight != null) {
      try {
        await api.post('/weight', {
          'value': weight,
          'unit': _weightUnit,
          'recorded_at': DateTime.now().toIso8601String(),
          'notes': 'Baseline starting weight during onboarding'
        });
      } catch (_) {}
    }
    final target = double.tryParse(_target.text);
    if (target != null && target > 0 && _goal != 'maintain') {
      try {
        await api.post('/goals', {
          'starting_weight': weight,
          'starting_weight_unit': _weightUnit,
          'target_weight': target,
          'target_weight_unit': _weightUnit,
          'notes': 'Initial $_goal goal configured during onboarding'
        });
      } catch (_) {}
    }
    if (mounted) context.go('/');
  }

  Widget _field(TextEditingController controller, String label,
          {bool secret = false,
          TextInputType? type,
          String? Function(String?)? validator}) =>
      Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextFormField(
              controller: controller,
              obscureText: secret,
              keyboardType: type,
              decoration: InputDecoration(labelText: label),
              validator: validator));

  Widget _content() => switch (_step) {
        0 => Column(children: [
            _field(_username, 'Username'),
            _field(_password, 'Password', secret: true),
            _field(_confirm, 'Confirm password', secret: true),
            Text('Your account is private to this Forma server.',
                style: Theme.of(context).textTheme.bodySmall),
          ]),
        1 => Column(children: [
            _field(_displayName, 'Display name'),
            const Text(
                'This name appears in your profile. You can change it later.')
          ]),
        2 => Column(children: [
            DropdownButtonFormField<String>(
                initialValue: _sex,
                decoration: const InputDecoration(labelText: 'Profile'),
                items: const [
                  DropdownMenuItem(value: 'female', child: Text('Female')),
                  DropdownMenuItem(value: 'male', child: Text('Male')),
                  DropdownMenuItem(
                      value: 'other', child: Text('Other / not specified'))
                ],
                onChanged: (v) => setState(() => _sex = v ?? 'other')),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
                initialValue: _units,
                decoration: const InputDecoration(labelText: 'Preferred units'),
                items: const [
                  DropdownMenuItem(
                      value: 'metric', child: Text('Metric (kg, cm)')),
                  DropdownMenuItem(
                      value: 'imperial', child: Text('Imperial (lb, in)'))
                ],
                onChanged: (v) => setState(() {
                      _units = v ?? 'metric';
                      _weightUnit = _units == 'metric' ? 'kg' : 'lb';
                    })),
          ]),
        3 => _field(_height, 'Height (cm)',
            type: const TextInputType.numberWithOptions(decimal: true)),
        4 => Column(children: [
            DropdownButtonFormField<String>(
                initialValue: _weightUnit,
                decoration: const InputDecoration(labelText: 'Weight unit'),
                items: const [
                  DropdownMenuItem(value: 'kg', child: Text('Kilograms (kg)')),
                  DropdownMenuItem(value: 'lb', child: Text('Pounds (lb)'))
                ],
                onChanged: (v) => setState(() => _weightUnit = v ?? 'kg')),
            const SizedBox(height: 12),
            _field(_weight, 'Current weight',
                type: const TextInputType.numberWithOptions(decimal: true))
          ]),
        _ => Column(children: [
            DropdownButtonFormField<String>(
                initialValue: _goal,
                decoration: const InputDecoration(labelText: 'Your goal'),
                items: const [
                  DropdownMenuItem(
                      value: 'maintain', child: Text('Maintain my weight')),
                  DropdownMenuItem(value: 'lose', child: Text('Lose weight')),
                  DropdownMenuItem(value: 'gain', child: Text('Gain weight'))
                ],
                onChanged: (v) => setState(() => _goal = v ?? 'maintain')),
            if (_goal != 'maintain') ...[
              const SizedBox(height: 12),
              _field(_target, 'Target weight ($_weightUnit)',
                  type: const TextInputType.numberWithOptions(decimal: true)),
              Text('You can adjust your target and pace any time.',
                  style: Theme.of(context).textTheme.bodySmall)
            ]
          ]),
      };

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).colorScheme.primary;
    return Scaffold(
        body: SafeArea(
            child: Center(
                child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 560),
                    child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Form(
                            key: _form,
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Row(children: [
                                    Icon(Icons.spa_outlined, color: accent),
                                    const SizedBox(width: 8),
                                    const Text('FORMA',
                                        style: TextStyle(
                                            fontWeight: FontWeight.w800,
                                            letterSpacing: 2)),
                                    const Spacer(),
                                    TextButton(
                                        onPressed: _step == 0
                                            ? () => context.go('/login')
                                            : () => setState(() {
                                                  _step--;
                                                  _error = null;
                                                }),
                                        child: Text(
                                            _step == 0 ? 'Sign in' : 'Back'))
                                  ]),
                                  const SizedBox(height: 24),
                                  Text(
                                      widget.setup
                                          ? 'Set up your Forma'
                                          : 'Create your Forma account',
                                      style: Theme.of(context)
                                          .textTheme
                                          .headlineSmall
                                          ?.copyWith(
                                              fontWeight: FontWeight.w700)),
                                  const SizedBox(height: 8),
                                  Text(
                                      'A few quick steps to make your progress meaningful.',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodyMedium),
                                  const SizedBox(height: 22),
                                  LinearProgressIndicator(
                                      value: (_step + 1) / _steps.length,
                                      minHeight: 5,
                                      borderRadius: BorderRadius.circular(8)),
                                  const SizedBox(height: 10),
                                  Text(
                                      'STEP ${_step + 1} OF ${_steps.length} · ${_steps[_step].toUpperCase()}',
                                      style: Theme.of(context)
                                          .textTheme
                                          .labelMedium
                                          ?.copyWith(
                                              color: accent,
                                              letterSpacing: 1.1)),
                                  const SizedBox(height: 20),
                                  Expanded(
                                      child: SingleChildScrollView(
                                          child: Card(
                                              child: Padding(
                                                  padding:
                                                      const EdgeInsets.all(20),
                                                  child: _content())))),
                                  if (_error != null)
                                    Padding(
                                        padding: const EdgeInsets.only(top: 12),
                                        child: Text(_error!,
                                            style: TextStyle(
                                                color: Theme.of(context)
                                                    .colorScheme
                                                    .error))),
                                  const SizedBox(height: 14),
                                  SizedBox(
                                      height: 52,
                                      child: FilledButton(
                                          onPressed:
                                              _submitting || _checkingUsername
                                                  ? null
                                                  : _next,
                                          child: _submitting ||
                                                  _checkingUsername
                                              ? const SizedBox.square(
                                                  dimension: 20,
                                                  child:
                                                      CircularProgressIndicator(
                                                          strokeWidth: 2))
                                              : Text(_step == _steps.length - 1
                                                  ? 'Finish setup'
                                                  : 'Continue'))),
                                ])))))));
  }
}
