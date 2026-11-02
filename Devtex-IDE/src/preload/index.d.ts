export {}
declare global {
  interface Window {
    devtex: {
      openProject(): Promise<{name:string;files:Array<{name:string;path:string;kind:'file'|'directory'}>} | null>
      getTree(): Promise<Array<{name:string;path:string;kind:'file'|'directory'}>>
      getRoot(): Promise<string | null>
      readFile(path:string): Promise<string>
      writeFile(path:string,content:string): Promise<boolean>
      create(path:string,kind:'file'|'directory'): Promise<Array<{name:string;path:string;kind:'file'|'directory'}>>
    }
  }
}