export type Source = {
  id: number;
  name: string;
  type: string;
  img?: string;
  filter?: string;
  remaining: string;
  gain: number;
  mute: boolean;
  cue: boolean;
  busA: boolean;
  busB: boolean;
  master: boolean;
  overlay: number | null;
};

const base = (o: Partial<Source> & Pick<Source, "id" | "name" | "type" | "remaining">): Source => ({
  gain: 75,
  mute: false,
  cue: false,
  busA: false,
  busB: false,
  master: true,
  overlay: null,
  ...o,
});

export const initialSources: Source[] = [
  base({ id: 1, name: "Palco geral", type: "Câmera", remaining: "-0:01" }),
  base({ id: 2, name: "Guitarra", type: "Câmera", remaining: "-0:02" }),
  base({ id: 3, name: "Bateria", type: "Câmera", remaining: "-0:17", gain: 30 }),
  base({ id: 4, name: "Teclado", type: "Vídeo", filter: "hue-rotate(180deg) saturate(1.2)", remaining: "-0:18", gain: 10 }),
  base({ id: 5, name: "Microfone", type: "NDI", filter: "grayscale(0.4) brightness(1.1)", remaining: "-0:10", gain: 25 }),
  base({ id: 6, name: "Violão", type: "Câmera", remaining: "-0:04" }),
  base({ id: 7, name: "Mãos no violão", type: "Câmera", filter: "sepia(0.6)", remaining: "-0:09" }),
  base({ id: 8, name: "Mesa de som", type: "Vídeo", filter: "hue-rotate(120deg)", remaining: "-0:15" }),
  base({ id: 9, name: "Pedal", type: "Vídeo", filter: "sepia(0.8) contrast(1.2)", remaining: "-0:05" }),
  base({ id: 10, name: "Bateria PB", type: "Câmera", filter: "grayscale(1)", remaining: "-0:09" }),
  base({ id: 11, name: "Título - Show", type: "Título / GC", remaining: "", master: false }),
];

export type TransitionType = "Fade" | "Merge" | "Wipe" | "Slide";