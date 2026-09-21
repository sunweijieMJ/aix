import { h, type FunctionalComponent } from 'vue';

/** 演示用 16×16 线性图标，stroke 跟随 currentColor */
function createIcon(name: string, paths: string[]): FunctionalComponent {
  const Icon: FunctionalComponent = () =>
    h(
      'svg',
      {
        viewBox: '0 0 24 24',
        width: 16,
        height: 16,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      paths.map((d) => h('path', { d })),
    );
  Icon.displayName = name;
  return Icon;
}

export const HomeIcon = createIcon('HomeIcon', [
  'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  'M9 22V12h6v10',
]);

export const GridIcon = createIcon('GridIcon', [
  'M3 3h7v7H3z',
  'M14 3h7v7h-7z',
  'M14 14h7v7h-7z',
  'M3 14h7v7H3z',
]);

export const BookIcon = createIcon('BookIcon', [
  'M4 19.5A2.5 2.5 0 0 1 6.5 17H20',
  'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z',
]);

export const VideoIcon = createIcon('VideoIcon', ['M23 7l-7 5 7 5V7z', 'M1 5h15v14H1z']);

export const EditIcon = createIcon('EditIcon', [
  'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7',
  'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
]);

export const SettingsIcon = createIcon('SettingsIcon', [
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
]);

export const UsersIcon = createIcon('UsersIcon', [
  'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2',
  'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'M23 21v-2a4 4 0 0 0-3-3.87',
  'M16 3.13a4 4 0 0 1 0 7.75',
]);

export const BellIcon = createIcon('BellIcon', [
  'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9',
  'M13.73 21a2 2 0 0 1-3.46 0',
]);

export const SearchIcon = createIcon('SearchIcon', [
  'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  'M21 21l-4.35-4.35',
]);

export const FileIcon = createIcon('FileIcon', [
  'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  'M14 2v6h6',
  'M16 13H8',
  'M16 17H8',
]);

export const ChartIcon = createIcon('ChartIcon', ['M18 20V10', 'M12 20V4', 'M6 20v-6']);

export const FolderIcon = createIcon('FolderIcon', [
  'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
]);

export const PlusIcon = createIcon('PlusIcon', ['M12 5v14', 'M5 12h14']);

export const LogoutIcon = createIcon('LogoutIcon', [
  'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4',
  'M16 17l5-5-5-5',
  'M21 12H9',
]);
