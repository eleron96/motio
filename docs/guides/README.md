# Guides

Short guides on getting value out of Motio — how to plan with it, not how to run it.
Each takes about five minutes, and everything in them can be tried in the
[live demo](https://motio.nikog.net/demo?utm_source=github&utm_medium=guide&utm_campaign=guides_index)
without signing up.

| Guide | For when |
|---|---|
| [Your first week in Motio](./first-week.md) | You have just opened Motio and want the team's real week on the timeline. |
| [Planning several projects with one team](./multiple-projects.md) | The same people work on several client or internal projects at once. |
| [Spotting overload before it becomes a problem](./spotting-overload.md) | You want to see who is overloaded while there is still time to fix it. |

Running your own copy? Time off and the workload heatmap are off by default on a new
install: set `VITE_FEATURE_TIME_OFF=true` and `VITE_FEATURE_WORKLOAD_HEATMAP=true` in
`.env` before building. Operating Motio itself — deploy, configuration, backups — is
covered in the [operations guide](../operations.md).
