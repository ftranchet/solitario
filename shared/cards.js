// @ts-check
/*
 * shared/cards.js — Componente de carta común a los juegos de cartas
 * (Solitario, Carta Blanca, Corazones).
 *
 * Se carga como <script> CLÁSICO (no módulo) ANTES del script del juego, así
 * define funciones GLOBALES —igual que cuando estaban embebidas en cada juego—
 * y tanto el juego como los tests las siguen viendo.
 *
 * Depende de dos globales que define cada juego (con su propio orden y, en
 * Corazones, el As como 14):
 *   SUIT         { <palo>: { symbol, color, name } }
 *   RANK_LABEL   { <rango>: "A" | "2".."10" | "J" | "Q" | "K" }
 *
 * El CSS de la CARA (índice/pip) queda en cada juego porque varía a propósito;
 * el "chrome" idéntico (fondo, colores de palo, dorso) vive en styles/cards.css.
 */

/** @param {Card} card */
function cardFace(card) {
  var s = SUIT[card.suit].symbol;
  return '<div class="idx"><span class="r">' + RANK_LABEL[card.rank] + '</span><span class="s">' + s + '</span></div>' +
         '<div class="pip">' + s + '</div>';
}

// Nombre legible del rango (para lectores de pantalla). As = rango 1 (Solitario/
// Carta Blanca) o 14 (Corazones).
/** @param {number} r */
function rankName(r) {
  return (r === 1 || r === 14) ? "As" : r === 11 ? "Jota" : r === 12 ? "Reina" : r === 13 ? "Rey" : String(r);
}
/** @param {Card} card */
function cardLabel(card) { return rankName(card.rank) + " de " + SUIT[card.suit].name; }

// Crea el elemento de carta. `selected` marca la carta como elegida (los juegos
// que no lo usan simplemente no lo pasan). Las cartas sin `faceUp` se consideran
// cara arriba; las boca abajo no revelan su identidad al lector de pantalla.
/**
 * @param {Card} card
 * @param {boolean} [selected]
 */
function makeCardEl(card, selected) {
  var up = card.faceUp !== false;
  var e = document.createElement("div");
  e.className = "card " + (up ? ("up " + card.suit) : "down") + (selected ? " sel" : "");
  e.setAttribute("role", "img");
  if (up) {
    e.innerHTML = cardFace(card);
    e.setAttribute("aria-label", cardLabel(card));
  } else {
    e.setAttribute("aria-label", "carta boca abajo");
  }
  return e;
}
