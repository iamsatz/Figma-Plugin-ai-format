export type LayoutMode = 'NONE' | 'VERTICAL' | 'HORIZONTAL';

export type ChildSnapshot = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FrameSnapshot = {
  id: string;
  name: string;
  type: 'FRAME' | 'GROUP' | 'COMPONENT' | 'INSTANCE' | 'OTHER';
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  layoutMode: LayoutMode;
  itemSpacing: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  children: ChildSnapshot[];
};
