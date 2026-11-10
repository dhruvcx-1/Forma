import 'package:flutter/material.dart';

class FormaStartupScreen extends StatelessWidget {
  const FormaStartupScreen({super.key});

  static const _background = Color(0xFF0A0D1B);

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: _background,
        body: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(0, -0.15),
              radius: 0.9,
              colors: [Color(0xFF171A38), _background],
              stops: [0, 1],
            ),
          ),
          child: Center(
            child: TweenAnimationBuilder<double>(
              duration: const Duration(milliseconds: 240),
              tween: Tween(begin: 0, end: 1),
              builder: (context, opacity, child) => Opacity(
                opacity: opacity,
                child: Transform.translate(
                  offset: Offset(0, 8 * (1 - opacity)),
                  child: child,
                ),
              ),
              child: Semantics(
                liveRegion: true,
                label: 'Loading Forma',
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Image.asset(
                      'assets/branding/forma-mark.png',
                      width: 92,
                      height: 92,
                      filterQuality: FilterQuality.high,
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'FORMA',
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            color: const Color(0xFFF4F3FF),
                            fontWeight: FontWeight.w700,
                            letterSpacing: 4.2,
                          ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Preparing your space',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: const Color(0xFFAAAFC7),
                          ),
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: 76,
                      child: LinearProgressIndicator(
                        minHeight: 3,
                        borderRadius: BorderRadius.circular(99),
                        backgroundColor: const Color(0xFF292D4A),
                        color: const Color(0xFF9B8AFF),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}
