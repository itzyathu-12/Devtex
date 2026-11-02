const $ = (selector: string) => document.querySelector(selector) as HTMLElement
const editor = $('#editor') as HTMLTextAreaElement
const tree = $('#tree')
let projectName = ''
let files: Array<{name:string;path:string;kind:'file'|'directory'}> = []
let activePath = ''
let dirty = false
let intent = localStorage.getItem('devtex-ide:intent') || ''
const output = $('#output')
function log(message: string): void { output.textContent += '\\n' + message; output.scrollTop = output.scrollHeight }
function setDirty(value: boolean): void {
  dirty = value
  $('#dirtyMark').textContent = value ? '●' : ''
  $('#saveStatus').textContent = value ? 'Unsaved changes' : 'Ready'
}
function renderTree(): void {
  const query = ($('#filter') as HTMLInputElement).value.toLowerCase()
  tree.replaceChildren()
  const visible = files.filter(file => file.path.toLowerCase().includes(query))
  $('#fileCount').textContent = visible.filter(file => file.kind === 'file').length + ' FILES'
  if (!visible.length) { const empty = document.createElement('div'); empty.className='empty'; empty.textContent='No matching files'; tree.append(empty); return }
  for (const file of visible) {
    const button = document.createElement('button')
    button.className = 'file-row' + (file.path === activePath ? ' active' : '')
    button.style.paddingLeft = (12 + (file.path.split('/').length - 1) * 13) + 'px'
    button.textContent = (file.kind === 'directory' ? '▸ ' : '◇ ') + file.name
    button.title = file.path
    if (file.kind === 'file') button.onclick = () => void openFile(file.path)
    tree.append(button)
  }
}
async function openFile(path: string): Promise<void> {
  if (dirty && !confirm('Discard unsaved changes and open another file?')) return
  try {
    const content = await window.devtex.readFile(path)
    activePath = path; editor.value = content; editor.disabled = false
    $('#activeTab').textContent = path; $('#statusFile').textContent = path; $('#footerFile').textContent = path
    $('#welcome').classList.add('hidden'); editor.classList.remove('hidden')
    setDirty(false); renderTree()
  } catch (error) { log('Could not open file: ' + String(error)) }
}
async function openProject(): Promise<void> {
  try {
    const project = await window.devtex.openProject()
    if (!project) return
    projectName = project.name; files = project.files; activePath = ''
    $('#projectName').textContent = projectName; $('#statusProject').textContent = projectName
    $('#welcome').classList.remove('hidden'); editor.classList.add('hidden')
    renderTree(); log('Opened project: ' + projectName)
  } catch (error) { log('Project open failed: ' + String(error)) }
}
async function saveFile(): Promise<void> {
  if (!activePath) { log('Open a file before saving.'); return }
  try {
    await window.devtex.writeFile(activePath, editor.value)
    setDirty(false); log('Saved ' + activePath)
  } catch (error) { log('Save failed: ' + String(error)) }
}
async function create(kind: 'file'|'directory'): Promise<void> {
  if (!projectName) { log('Open a project directory first.'); return }
  const path = prompt(kind === 'file' ? 'New file path (example: src/index.ts)' : 'New folder path (example: src/components)')
  if (!path?.trim()) return
  try {
    files = await window.devtex.create(path.trim(), kind)
    renderTree(); log('Created ' + kind + ': ' + path)
    if (kind === 'file') await openFile(path.trim())
  } catch (error) { log('Create failed: ' + String(error)) }
}
function updateGutter(): void {
  const lines = editor.value.split('\\n').length
  $('#gutter').textContent = Array.from({length:lines},(_,i)=>String(i+1)).join('\\n')
}
$('#openProject').addEventListener('click', () => void openProject())
$('#welcomeOpen').addEventListener('click', () => void openProject())
$('#save').addEventListener('click', () => void saveFile())
$('#addFile').addEventListener('click', () => void create('file'))
$('#newFile').addEventListener('click', () => void create('file'))
$('#addFolder').addEventListener('click', () => void create('directory'))
$('#filter').addEventListener('input', renderTree)
$('#clearOutput').addEventListener('click', () => { output.textContent = 'Output cleared.' })
editor.addEventListener('input', () => { setDirty(true); updateGutter() })
editor.addEventListener('scroll', () => { $('#gutter').scrollTop = editor.scrollTop })
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveFile() }
})
$('#intentText').textContent = intent
$('#saveIntent').addEventListener('click', () => {
  intent = ($('#intentText') as HTMLTextAreaElement).value.trim()
  localStorage.setItem('devtex-ide:intent', intent)
  $('#intentStatus').textContent = intent ? 'Intent saved locally' : 'No intent pinned'
  log(intent ? 'Workspace intent updated.' : 'Workspace intent cleared.')
})
if (intent) ($('#intentText') as HTMLTextAreaElement).value = intent
editor.disabled = true
