import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../state/session_state.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final form = GlobalKey<FormState>();
  final username = TextEditingController();
  final password = TextEditingController();
  bool obscure = true;

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionState>();
    final setup = session.status?['isSetup'] == false;
    final canRegister = session.status?['registrationEnabled'] == true;
    final creating = setup;
    return Scaffold(
        body: Center(
            child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 430),
      child: Padding(
          padding: const EdgeInsets.all(28),
          child: Form(
            key: form,
            child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('FORMA',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          letterSpacing: 3,
                          color: Theme.of(context).colorScheme.primary)),
                  const SizedBox(height: 22),
                  Text(
                      setup
                          ? 'A clearer picture of your progress.'
                          : 'Welcome back.',
                      style: Theme.of(context)
                          .textTheme
                          .headlineMedium
                          ?.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Text(
                      setup
                          ? 'Create the administrator account for this Forma instance.'
                          : 'Sign in to continue your progress.',
                      style: Theme.of(context).textTheme.bodyMedium),
                  const SizedBox(height: 28),
                  TextFormField(
                      controller: username,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Username'),
                      validator: (v) => (v == null || v.trim().length < 3)
                          ? 'Enter at least 3 characters'
                          : null),
                  const SizedBox(height: 12),
                  TextFormField(
                      controller: password,
                      obscureText: obscure,
                      decoration: InputDecoration(
                          labelText: 'Password',
                          suffixIcon: IconButton(
                              onPressed: () =>
                                  setState(() => obscure = !obscure),
                              icon: Icon(obscure
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined))),
                      validator: (v) => (v == null || v.length < 8)
                          ? 'Enter at least 8 characters'
                          : null),
                  if (session.error != null) ...[
                    const SizedBox(height: 14),
                    Text(session.error!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error)),
                  ],
                  const SizedBox(height: 20),
                  SizedBox(
                      width: double.infinity,
                      height: 52,
                      child: FilledButton(
                          onPressed: session.busy
                              ? null
                              : () async {
                                  if (!form.currentState!.validate()) return;
                                  if (await context.read<SessionState>().signIn(
                                          username.text, password.text,
                                          setup: setup) &&
                                      context.mounted) {
                                    context.go('/');
                                  }
                                },
                          child: session.busy
                              ? const SizedBox.square(
                                  dimension: 20,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2))
                              : Text(creating ? 'Create account' : 'Sign in'))),
                  if (!setup && canRegister) ...[
                    const SizedBox(height: 10),
                    Center(
                        child: TextButton(
                      onPressed: () => context.go('/register'),
                      child: const Text('Create a new account'),
                    )),
                  ],
                ]),
          )),
    )));
  }
}
