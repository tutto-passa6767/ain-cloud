// Связь глобальных команд (палитра, горячие клавиши) с открытой медиатекой:
// куда загружать файлы и кто откроет диалог «Создать папку».

interface DriveHandler {
  folderId: string | null;
  newFolder: () => void;
}

let handler: DriveHandler | null = null;
let pendingNewFolder = false;

export const driveBus = {
  /** Медиатека регистрируется при показе папки; возвращает функцию отписки */
  register(h: DriveHandler) {
    handler = h;
    if (pendingNewFolder) {
      pendingNewFolder = false;
      queueMicrotask(() => h.newFolder());
    }
    return () => {
      if (handler === h) handler = null;
    };
  },
  /** Папка, в которую уйдут файлы из палитры и по клавише U: открытая сейчас или корень */
  currentFolder(): string | null {
    return handler?.folderId ?? null;
  },
  /** Открыть «Создать папку»: сразу, если медиатека на экране, иначе — после перехода в неё */
  newFolder(navigate: (href: string) => void) {
    if (handler) handler.newFolder();
    else {
      pendingNewFolder = true;
      navigate('/drive');
    }
  },
};
