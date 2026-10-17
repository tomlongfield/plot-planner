# Source for src/i18n/en.json, kept as Python for comments. Run: python3 scripts/messages-en.py
import json, os
M = {
 'language.name': 'English',
 'app.name': 'Plot planner', 'app.nav': 'Main', 'app.skip': 'Skip to content', 'app.loading': 'Opening your plan…',
 'app.switchPlot': 'Switch plot', 'app.theme': 'Theme: {theme}. Change theme', 'app.undo': 'Undo', 'app.undoHint': 'Undo the last change (Ctrl or Cmd + Z)',
 'app.warnings': '{n} warnings', 'app.later': 'Later',
 'app.backupNudge': 'Your plan is kept only in this browser. Save a backup file now and then so you can\'t lose it.',
 'app.storageUnavailable': 'This browser won\'t let the app save, so changes will be lost when you close the page. Private browsing often causes this.',
 'app.noPlot': 'No plot yet', 'app.noPlotHelp': 'Add a plot to start planning: give it a name and its size, and draw your beds.', 'app.makePlot': 'Add a plot',
 'error.save': 'Couldn\'t save: {error}',
 'theme.system': 'match system', 'theme.light': 'light', 'theme.dark': 'dark',
 'nav.month': 'Month', 'nav.plan': 'Layout', 'nav.plantings': 'Plantings', 'nav.tasks': 'Tasks', 'nav.seeds': 'Seeds', 'nav.crops': 'Crops', 'nav.settings': 'Settings',
 'nav.short.month': 'Month', 'nav.short.plan': 'Layout', 'nav.short.plantings': 'Plants', 'nav.short.tasks': 'Tasks', 'nav.short.seeds': 'Seeds', 'nav.short.crops': 'Crops', 'nav.short.settings': 'Settings',
 'draft': 'draft',
 # Directions
 'dir.N': 'north', 'dir.E': 'east', 'dir.S': 'south', 'dir.W': 'west',
 'dir.long.N': 'North', 'dir.long.E': 'East', 'dir.long.S': 'South', 'dir.long.W': 'West',
 'plan.aria': 'Plan of {name}, {w} by {l} metres, {top} at the top',
 # Area kinds and protection
 'kind.bed': 'Bed', 'kind.section': 'Section', 'kind.rows': 'Rows', 'kind.grid': 'Grid', 'kind.container': 'Container',
 'protection.none': 'Open ground', 'protection.cloche': 'Cloche', 'protection.coldframe': 'Cold frame', 'protection.greenhouse': 'Greenhouse', 'protection.polytunnel': 'Polytunnel', 'protection.heated': 'Heated greenhouse',
 'place.plot': 'On the plot', 'place.home': 'Home', 'place.propagation': 'Propagation', 'place.admin': 'Admin',
 'ttype.sow': 'Sow', 'ttype.plant': 'Plant', 'ttype.harvest': 'Harvest', 'ttype.order': 'Order', 'ttype.job': 'Job',
 'rotation.alliums': 'onion family', 'rotation.legumes': 'peas and beans', 'rotation.brassicas': 'cabbage family', 'rotation.roots': 'roots', 'rotation.potatoes': 'potatoes and tomatoes',
 'rotation.cucurbits': 'squash family', 'rotation.salads': 'salads', 'rotation.misc': 'other', 'rotation.perennial': 'perennials',
 # Units
 'unit.plants.one': '{n} plant', 'unit.plants.other': '{n} plants', 'unit.plugs.one': '{n} plug', 'unit.plugs.other': '{n} plugs',
 'unit.clumps.one': '{n} clump', 'unit.clumps.other': '{n} clumps', 'unit.cloves.one': '{n} clove', 'unit.cloves.other': '{n} cloves',
 'unit.sets.one': '{n} set', 'unit.sets.other': '{n} sets', 'unit.tubers.one': '{n} tuber', 'unit.tubers.other': '{n} tubers',
 'unit.metres.one': '{n} m of row', 'unit.metres.other': '{n} m of row', 'unit.seeds.one': '{n} seed', 'unit.seeds.other': '{n} seeds',
 'qty.clumpsOf': '{n} clumps of {per}',
 # Plan cells
 'cell.sow': 'Sow {when}', 'cell.plantOut': 'Plant out {when}', 'cell.plant': 'Plant {when}', 'cell.clear': 'Clear {when}', 'cell.harvestFrom': 'Harvest from {when}',
 'cell.harvesting': 'Harvesting', 'cell.growing': 'Growing', 'cell.slow': 'Slow growth', 'cell.empty': 'Empty', 'cell.perennial': 'Perennials',
 # Month view
 'month.tabs': 'Months', 'month.all': 'All months', 'month.open': 'Open {month}', 'month.planTitle': 'Plan of {plot} in {month}',
 'month.onPlot': 'On the plot', 'month.elsewhere': 'Elsewhere', 'month.noPlotJobs': 'Nothing to do on the plot this month.', 'month.noElsewhereJobs': 'Nothing at home or in the propagator.',
 'month.lastFrost': 'Last frost about {date}', 'month.firstFrost': 'First frost about {date}', 'month.slow': 'Short days: slow growth',
 'month.drafts': '{n} in draft', 'month.legend.changes': 'Changes this month', 'month.legend.draft': 'Draft',
 'month.hint': 'Select an area on the plan to see what is there now, what comes next and what grew there before.',
 'summary.goingIn.one': '{n} planting goes in', 'summary.goingIn.other': '{n} plantings go in',
 'summary.harvests.one': '{n} harvest starts', 'summary.harvests.other': '{n} harvests start',
 'summary.clears.one': '{n} bed to clear', 'summary.clears.other': '{n} beds to clear',
 'summary.elsewhere.one': '{n} job at home', 'summary.elsewhere.other': '{n} jobs at home or in the propagator',
 'summary.quiet': 'a quiet month on the plot', 'summary.sep': ', ',
 # Area panel
 'area.back': 'Back to the month', 'area.addPlanting': 'Add a planting here', 'area.perennial': 'perennial',
 'area.now': 'Now', 'area.next': 'Next', 'area.history': 'Before', 'area.nothingNow': 'Nothing growing here this month.', 'area.nothingNext': 'Nothing planned yet.', 'area.noHistory': 'No earlier plantings recorded.',
 'area.from': 'from {date}', 'area.until': 'until {date}', 'area.rows': 'rows {rows}', 'area.capacity': '{needed} of {fits} {unit} ({working})', 'area.waiting': 'waiting in modules {days} days',
 # Tasks (generated)
 'task.sow': 'Sow {name} in modules', 'task.sowDirect': 'Sow {name}', 'task.potOn': 'Pot on {name}', 'task.hardenOff': 'Harden off {name}',
 'task.plantOut': 'Plant out {name}', 'task.plant': 'Plant {name}', 'task.fleece': 'Keep fleece ready for {name}', 'task.net': 'Net {name}',
 'task.mesh': 'Cover {name} with fine mesh', 'task.thin': 'Thin {name}', 'task.support': 'Put up supports for {name}', 'task.earthUp': 'Earth up {name}',
 'task.pinchOut': 'Pinch out {name}', 'task.chit': 'Chit {name}', 'task.harvest': 'First harvest of {name}', 'task.cure': 'Cure and store {name}', 'task.clear': 'Clear {name}',
 'task.qty.modules': '{n} modules, {seeds} seeds each', 'task.detail.bottomHeat': 'Bottom heat, about {temp} °C',
 'task.markDone': 'Mark done: {title}', 'task.markTodo': 'Mark not done: {title}', 'task.overdue': 'overdue',
 # Warnings
 'warn.conflict': '{a} and {b} overlap in the same ground from {from}.', 'warn.conflict.now': '{a} and {b} overlap in the same ground.',
 'warn.capacity': '{name} needs room for {needed} but {area} fits {fits} ({working}).',
 'warn.missingArea': '{name} is in an area that no longer exists. Move it to another area.',
 'warn.endDate': '{name} runs until {until}, after the plot ends on {end}.',
 'warn.frostFree': '{name} needs about {needed} frost-free days; this spot gets about {has}.',
 'warn.frost': '{name} goes out on {date}, before the last frost (about {lastFrost}). Plant later, or protect it.',
 'warn.rotation': '{name} is {group}, which grew here in {when}. Leave {years} years between them if you can.',
 'warn.problem': '{problem} was logged here on {date}, and {name} is prone to it.',
 'warn.crossing': '{a} and {b} ({species}) can cross and will flower together, {distance} m apart. They need {isolation} m.',
 'warn.crossing.apart': '{a} and {b} ({species}) can cross and will flower together. They need {isolation} m apart.',
 'warn.crossing.options': 'Grow them further apart, stagger the sowings so they flower at different times, or hand-pollinate and bag the flowers.',
 'warn.waiting': '{name} waits in modules {days} days longer than planned while the bed is cleared.',
 'warn.outgrow': '{name} spends {days} days in modules; most plants outgrow their cells after {max}. Pot on or sow later.',
 'warn.oldSeed': '{name} seed is from {acquired}; it usually keeps about {years} years. Do a germination test.',
 'warn.seedUseBy': '{name} seed was best used by {useBy}.',
 'warn.propCapacity': '{space} needs {needed} {unit} in the week of {week} but holds {capacity}.',
 'warn.open': 'Open',
 # Toasts
 'toast.undone': 'Undone: {label}', 'toast.taskDone': 'Done: {title}', 'toast.plantingAdded': 'Added {name}', 'toast.plantingSaved': 'Saved {name}',
 'toast.plantingDeleted': 'Deleted {name}', 'toast.datesMoved': 'Dates moved', 'toast.draftAccepted': 'Draft accepted', 'toast.draftRejected': 'Draft discarded',
 'toast.climateChanged': 'Frost dates changed. Dates moved to match.', 'toast.protectionChanged': 'Protection changed. Tender crops moved to match.',
 'toast.backedUp': 'Backup saved', 'toast.status.planned': 'Marked planned', 'toast.status.sown': 'Marked sown', 'toast.status.growing': 'Marked planted out',
 'toast.status.harvesting': 'Marked harvesting', 'toast.status.cleared': 'Marked cleared', 'toast.status.failed': 'Marked failed',
 'settings.backupNow': 'Back up now',
}
out = os.path.join(os.path.dirname(__file__), '..', 'src', 'i18n', 'en.json')
json.dump(dict(sorted(M.items())), open(out, 'w'), indent=1, ensure_ascii=False)
open(out, 'a').write('\n')
print(len(M), 'messages')
