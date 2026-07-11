/*
 * shared/global.d.ts — Declaraciones ambientales para el chequeo de tipos
 * (`// @ts-check`) de los módulos compartidos (shared/*.js, games/registry.js).
 *
 * No es un módulo real ni se sirve al navegador ni se enlaza desde ningún
 * HTML: sólo lo usa `tsc --checkJs` (ver tsconfig.json) para validar que los
 * archivos compartidos son consistentes entre sí. Los motores de cada juego
 * (games/solitario.js, etc. — externalizados de <script> inline en la Fase 1
 * de PLAN.md) NO están tipados; sus propias globals (SUIT, RANK_LABEL, state,
 * players, grid...) no se declaran acá.
 */
export {};

// Todas las interfaces van DENTRO de `declare global` (no a nivel de este
// módulo) para que sean visibles desde el JSDoc de los scripts NO-módulo
// (shared/*.js, games/registry.js) que sólo conocen el ámbito global.
declare global {
  interface Card {
    suit: string;
    rank: number;
    color?: string;
    faceUp?: boolean;
    id?: number | string;
  }

  interface Suit {
    symbol: string;
    color: string;
    name: string;
  }

  interface StatHelpers {
    n: (v: unknown) => number;
    fmtTime: (s: unknown) => string;
    rate: (won: number, played: number) => string;
    row: (label: string, value: unknown) => string;
    rowPlayed: (st: Record<string, unknown>) => string;
  }

  interface GameEntry {
    id: string;
    title: string;
    href: string;
    icon: string;
    statsKey: string;
    body: (stats: Record<string, any>, h: StatHelpers) => string;
  }

  // shared/cards.js depende de estas dos globals, que cada juego define con
  // su propio orden (y, en Corazones, el As como rango 14).
  var SUIT: Record<string, Suit>;
  var RANK_LABEL: Record<number, string>;

  function cardFace(card: Card): string;
  function rankName(r: number): string;
  function cardLabel(card: Card): string;
  function makeCardEl(card: Card, selected?: boolean): HTMLDivElement;

  function toast(msg: string): void;
  function keyActivate(el: HTMLElement, handler: () => void): void;
  function clickActivate(el: HTMLElement, handler: () => void): void;

  var GAME_KEY: string;
  var LOCK_KEY: string;
  var TAB_ID: string;
  var saveOwner: boolean;
  var saveWarned: boolean;
  function refreshSaveLock(): void;
  function gameSet(v: string): void;
  function gameDel(): void;

  // shared/storage.js — validación de valores de localStorage (RNF-04)
  function asNum(v: unknown, def: number): number;
  function asIntInRange(v: unknown, min: number, max: number, def: number): number;

  var GAMES: GameEntry[];

  // shared/theme.js
  function getThemePref(): string;
  function setThemePref(p: string): void;

  // shared/drag.js depende de estas globals, que Solitario y Carta Blanca
  // (los dos únicos consumidores) declaran con el mismo nombre y sentido:
  // ¿autocompletado en curso? (bloquea el arrastre), la selección activa,
  // el tamaño de carta vigente y las acciones de fin de jugada.
  var autoTimer: unknown;
  var selection: { pile: string; col: number; index: number } | null;
  var CW: number;
  var CH: number;
  function startTimer(): void;
  function render(): void;
  function checkWin(): void;
  function getSelectionCards(): Card[] | null;
}
