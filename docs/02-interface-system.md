# SAIP Board interface

The official transparent [SAIP logo](https://drive.google.com/file/d/1MC5pv-gIT7lOH4hjyRZ5GvBVD7H2qQEM/view) is stored as `public/saip-logo.png` and used in the workspace, sign-in and browser tab. Keep the asset on white so its original black lettering remains legible.

The forest navigation rail and pale canvas define the workspace. Use Geist for controls, labels and reading, and the serif display style for page titles and the next meeting. The main spacing steps are 4, 8, 12, 16, 24, 32 and 40 pixels; page gutters and titles scale with viewport width. Use the semantic Tailwind colors from `src/app/globals.css` for text, actions and status. Pair status colors with a visible label.

Use `PageHeader` for the page’s purpose and primary action, then put records first. Use `WorkList` and `WorkEntry` for date-led lists, and `Table` for records that benefit from column comparison. The table shows labeled, stacked fields when its own container is narrow. For forms beside a list, use `workspace-grid`, `Editor` and `EditorLink`; the link opens the editor and takes the reader to it. Retain `ActionForm` for pending and result feedback. Use `EmptyState` to explain what belongs in the list and what the member can do next.

Finance uses a labeled balance summary, a ledger and separate entry forms. Messaging uses a conversation list, search, a thread and a composer. New views should reuse these structures and keep their data, capability checks and mutations in the existing server layer.
