import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import 'data/api_client.dart';
import 'screens/auth_screen.dart';
import 'screens/feature_screens.dart';
import 'screens/home_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/startup_screen.dart';
import 'state/session_state.dart';
import 'state/theme_state.dart';
import 'theme/forma_theme.dart';

class FormaApp extends StatefulWidget {
  const FormaApp({super.key, required this.api});
  final ApiClient api;
  @override
  State<FormaApp> createState() => _FormaAppState();
}

class _FormaAppState extends State<FormaApp> {
  late final GoRouter router;
  @override
  void initState() {
    super.initState();
    final session = context.read<SessionState>();
    router = GoRouter(
      initialLocation: '/',
      refreshListenable: session,
      redirect: (context, state) {
        final path = state.matchedLocation;
        if (session.isRestoring) {
          if (path == '/startup') return null;
          return '/startup?from=${Uri.encodeComponent(state.uri.toString())}';
        }

        if (path == '/startup') {
          var destination =
              Uri.tryParse(state.uri.queryParameters['from'] ?? '/') ??
                  Uri(path: '/');
          if (destination.hasScheme ||
              destination.hasAuthority ||
              !destination.path.startsWith('/') ||
              destination.path == '/startup') {
            destination = Uri(path: '/');
          }
          final destinationPath = destination.path;
          final destinationIsOpen = _isOpenRoute(destinationPath);
          if (session.user == null && session.status?['isSetup'] == false) {
            return '/setup';
          }
          if (session.user == null && !destinationIsOpen) return '/login';
          if (session.user != null && destinationPath == '/login') return '/';
          return destination.toString();
        }

        if (session.busy) return null;
        final open = _isOpenRoute(path);
        final setupNeeded = session.status?['isSetup'] == false;
        final registrationEnabled =
            session.status?['registrationEnabled'] == true;
        if (session.user == null && setupNeeded && path != '/setup') {
          return '/setup';
        }
        if (path == '/setup' && !setupNeeded) {
          return session.user == null ? '/login' : '/';
        }
        if (path == '/register' && !registrationEnabled) {
          return '/login';
        }
        if (session.user == null && !open) {
          return '/login';
        }
        if (session.user != null &&
            (path == '/login' || path == '/setup' || path == '/register')) {
          return '/';
        }
        return null;
      },
      routes: [
        GoRoute(
            path: '/startup', builder: (_, __) => const FormaStartupScreen()),
        GoRoute(path: '/login', builder: (_, __) => const AuthScreen()),
        GoRoute(
            path: '/setup',
            builder: (_, __) => const OnboardingScreen(setup: true)),
        GoRoute(
            path: '/register',
            builder: (_, __) => const OnboardingScreen(setup: false)),
        GoRoute(
            path: '/u/:username',
            builder: (_, state) => PublicProfileScreen(
                api: widget.api, username: state.pathParameters['username']!)),
        GoRoute(
            path: '/@:username',
            builder: (_, state) => PublicProfileScreen(
                api: widget.api, username: state.pathParameters['username']!)),
        GoRoute(
            path: '/fasting/widget',
            builder: (_, __) => FastingWidgetScreen(api: widget.api)),
        ShellRoute(
            builder: (_, state, child) => FormaShell(
                api: widget.api, location: state.matchedLocation, child: child),
            routes: [
              GoRoute(
                  path: '/', builder: (_, __) => HomeScreen(api: widget.api)),
              GoRoute(
                  path: '/weight',
                  builder: (_, __) => WeightScreen(api: widget.api)),
              GoRoute(
                  path: '/measurements',
                  builder: (_, __) => MeasurementsScreen(api: widget.api)),
              GoRoute(
                  path: '/measurements/:id',
                  builder: (_, state) => MeasurementDetailScreen(
                      api: widget.api, id: state.pathParameters['id']!)),
              GoRoute(
                  path: '/goals',
                  builder: (_, __) => GoalsScreen(api: widget.api)),
              GoRoute(
                  path: '/nutrition',
                  builder: (_, __) => NutritionScreen(api: widget.api)),
              GoRoute(
                  path: '/fasting',
                  builder: (_, __) => FastingScreen(api: widget.api)),
              GoRoute(
                  path: '/photos',
                  builder: (_, __) => PhotosScreen(api: widget.api)),
              GoRoute(
                  path: '/settings',
                  builder: (_, __) => SettingsScreen(api: widget.api)),
              GoRoute(
                  path: '/data',
                  builder: (_, __) => DataScreen(api: widget.api)),
              GoRoute(
                  path: '/admin',
                  builder: (_, __) => AdminScreen(api: widget.api)),
            ]),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = context.watch<ThemeState>();
    return MaterialApp.router(
      title: 'Forma',
      debugShowCheckedModeBanner: false,
      theme: FormaTheme.lightFor(theme.accentColor),
      darkTheme: FormaTheme.darkFor(theme.accentColor),
      themeMode: theme.mode,
      routerConfig: router,
    );
  }

  @override
  void dispose() {
    router.dispose();
    super.dispose();
  }
}

bool _isOpenRoute(String path) =>
    path == '/login' ||
    path == '/setup' ||
    path == '/register' ||
    path.startsWith('/u/') ||
    path.startsWith('/@') ||
    path == '/fasting/widget';

class FormaShell extends StatelessWidget {
  const FormaShell(
      {super.key,
      required this.api,
      required this.child,
      required this.location});
  final ApiClient api;
  final Widget child;
  final String location;

  static const destinations = <(String, String, IconData)>[
    ('/', 'Overview', Icons.space_dashboard_outlined),
    ('/weight', 'Weight', Icons.monitor_weight_outlined),
    ('/measurements', 'Measurements', Icons.accessibility_new),
    ('/goals', 'Goals', Icons.flag_outlined),
    ('/nutrition', 'Nutrition', Icons.restaurant_outlined),
    ('/fasting', 'Fasting', Icons.bolt_outlined),
    ('/photos', 'Photos', Icons.photo_library_outlined),
    ('/data', 'Data & backups', Icons.file_download_outlined),
    ('/settings', 'Settings', Icons.tune_outlined),
  ];

  int get selected => destinations
      .indexWhere((d) =>
          location == d.$1 || (d.$1 != '/' && location.startsWith('${d.$1}/')))
      .clamp(0, destinations.length - 1);
  String get title => destinations[selected].$2;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final wide = width >= 1000;
    final session = context.watch<SessionState>();
    return Scaffold(
      appBar: AppBar(
          title: Row(mainAxisSize: MainAxisSize.min, children: [
            Image.asset('assets/branding/forma-mark.png',
                width: 25, height: 25, filterQuality: FilterQuality.high),
            const SizedBox(width: 9),
            const Text('FORMA',
                style:
                    TextStyle(fontWeight: FontWeight.w800, letterSpacing: 2)),
          ]),
          titleSpacing: 18,
          actions: [
            PopupMenuButton<String>(
              tooltip: 'Account',
              icon: const Icon(Icons.account_circle_outlined),
              onSelected: (value) {
                if (value == 'settings') context.go('/settings');
                if (value == 'signout') context.read<SessionState>().signOut();
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                    enabled: false,
                    value: 'who',
                    child: Text(session.user?['displayName']?.toString() ??
                        session.user?['username']?.toString() ??
                        'Account')),
                const PopupMenuItem(value: 'settings', child: Text('Settings')),
                const PopupMenuItem(value: 'signout', child: Text('Sign out'))
              ],
            ),
            const SizedBox(width: 12)
          ]),
      body: Row(children: [
        if (wide) _DesktopNavigation(selected: selected, user: session.user),
        Expanded(child: child),
      ]),
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: _mobileIndex,
              onDestinationSelected: (i) {
                const paths = ['/', '/weight', '/measurements', '/fasting'];
                if (i < paths.length) {
                  context.go(paths[i]);
                } else {
                  _showMore(context, session.user?['role'] == 'admin');
                }
              },
              destinations: const [
                NavigationDestination(
                    icon: Icon(Icons.space_dashboard_outlined), label: 'Home'),
                NavigationDestination(
                    icon: Icon(Icons.monitor_weight_outlined), label: 'Weight'),
                NavigationDestination(
                    icon: Icon(Icons.accessibility_new), label: 'Studio'),
                NavigationDestination(
                    icon: Icon(Icons.bolt_outlined), label: 'Fasting'),
                NavigationDestination(
                    icon: Icon(Icons.more_horiz), label: 'More'),
              ],
            ),
    );
  }

  int get _mobileIndex =>
      switch (selected) { 0 => 0, 1 => 1, 2 => 2, 5 => 3, _ => 4 };

  void _showMore(BuildContext context, bool isAdmin) {
    showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (context) => SafeArea(
                child: ListView(shrinkWrap: true, children: [
              for (final d in destinations.skip(3))
                ListTile(
                    leading: Icon(d.$3),
                    title: Text(d.$2),
                    onTap: () {
                      Navigator.pop(context);
                      context.go(d.$1);
                    }),
              if (isAdmin)
                ListTile(
                    leading: const Icon(Icons.admin_panel_settings_outlined),
                    title: const Text('Administration'),
                    onTap: () {
                      Navigator.pop(context);
                      context.go('/admin');
                    }),
            ])));
  }
}

class _DesktopNavigation extends StatelessWidget {
  const _DesktopNavigation({required this.selected, required this.user});
  final int selected;
  final Map<String, dynamic>? user;
  @override
  Widget build(BuildContext context) => Container(
        width: 238,
        decoration: BoxDecoration(
            border: Border(
                right: BorderSide(
                    color: Theme.of(context)
                        .dividerColor
                        .withValues(alpha: .35)))),
        child: Column(children: [
          const SizedBox(height: 10),
          Expanded(
              child: ListView(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  children: [
                for (var i = 0; i < FormaShell.destinations.length; i++)
                  _NavItem(
                      item: FormaShell.destinations[i],
                      selected: i == selected),
                if (user?['role'] == 'admin')
                  const _NavItem(item: (
                    '/admin',
                    'Administration',
                    Icons.admin_panel_settings_outlined
                  ), selected: false),
              ])),
          Padding(
              padding: const EdgeInsets.all(16),
              child: Text('Your data stays on your Forma server.',
                  style: Theme.of(context).textTheme.bodySmall)),
        ]),
      );
}

class _NavItem extends StatelessWidget {
  const _NavItem({required this.item, required this.selected});
  final (String, String, IconData) item;
  final bool selected;
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: ListTile(
        selected: selected,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        leading: Icon(item.$3),
        title: Text(item.$2),
        onTap: () => context.go(item.$1),
      ));
}
