# Simulation timing

The animation callback separates elapsed simulation time from rendering throughput. `GameCore.simulationSlices(elapsed)` splits each frame's elapsed seconds into equal substeps of at most 50 ms, with a total budget of 250 ms and at most five updates before one render.

| Frame interval | Updates | Total simulated time |
| --- | --- | --- |
| 16.67 ms | One 16.67 ms step | 16.67 ms |
| 100 ms | Two 50 ms steps | 100 ms |
| 250 ms | Five 50 ms steps | 250 ms |
| 500 ms | Five 50 ms steps | 250 ms |

These are bounded variable substeps, not a fixed-timestep accumulator. Elapsed time above 250 ms is discarded rather than queued; this bounds catch-up work and collision-step size. Extremely slow rendering can therefore still slow gameplay.

Invalid, negative and initial elapsed values yield a zero update. The first update can initialize spawning without advancing game time. The update loop stops immediately when the stage ends or the mode changes.

Gameplay duration, shields and effects use simulation time. Pause/resume resets the frame clock, so time spent paused or hidden is not consumed on the next frame. The render loop stops while hidden, after context loss and behind opaque menus; the animated character showcase can continue while visible unless reduced motion is enabled.

## Coverage

Node timing tests cover normal and slow intervals, capped backlog, invalid values and preservation of elapsed play time. The controlled-clock integration suite exercises the actual game callback at 100, 250 and 500 ms cadences, including stage completion and a synthetic 60-second pause/resume. Its null renderer makes these timing and gameplay checks; it does not measure graphics throughput, frame rate or battery use.
