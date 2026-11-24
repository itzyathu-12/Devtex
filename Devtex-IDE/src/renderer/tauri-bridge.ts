type ProjectItem={name:string;path:string;kind:'file'|'directory'}
type TauriGlobal={core:{invoke<T>(command:string,args?:Record<string,unknown>):Promise<T>}}
declare global { interface Window { __TAURI__:TauriGlobal; devtex:{
 openProject():Promise<{name:string;files:ProjectItem[]}|null>
 getTree(directory?:string):Promise<ProjectItem[]>
 getRoot():Promise<string|null>
 readFile(path:string):Promise<string>
 writeFile(path:string,content:string):Promise<boolean>
 create(path:string,kind:'file'|'directory'):Promise<ProjectItem[]>
} } }
const invoke=<T>(command:string,args?:Record<string,unknown>)=>window.__TAURI__.core.invoke<T>(command,args)
window.devtex={
 async openProject(){const project=await invoke<{name:string}|null>('project_open');if(!project)return null;return{name:project.name,files:await invoke<ProjectItem[]>('project_tree',{directory:''})}},
 getTree:(directory='')=>invoke<ProjectItem[]>('project_tree',{directory}),
 getRoot:()=>invoke<string|null>('project_root'),
 readFile:path=>invoke<string>('file_read',{relativePath:path}),
 writeFile:(path,content)=>invoke<boolean>('file_write',{relativePath:path,content}),
 create:(path,kind)=>invoke<ProjectItem[]>('file_create',{relativePath:path,kind})
}
