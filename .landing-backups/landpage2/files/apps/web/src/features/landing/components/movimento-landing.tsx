"use client";
import { useEffect } from "react";

export function MovimentoLanding() {
  useEffect(() => {
    const elementos = document.querySelectorAll<HTMLElement>("[data-revelar]");
    const preferencia = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observador: IntersectionObserver | undefined;
    function configurar() {
      observador?.disconnect();
      if (preferencia.matches || !("IntersectionObserver" in window)) {
        elementos.forEach((el) => el.classList.add("revelado"));
        return;
      }
      observador = new IntersectionObserver(
        (entradas) => {
          entradas.forEach((entrada) => {
            if (entrada.isIntersecting) {
              entrada.target.classList.add("revelado");
              observador?.unobserve(entrada.target);
            }
          });
        },
        { threshold: 0.15 },
      );
      elementos.forEach((el) => observador?.observe(el));
    }
    configurar();
    preferencia.addEventListener("change", configurar);
    return () => {
      observador?.disconnect();
      preferencia.removeEventListener("change", configurar);
    };
  }, []);
  return null;
}
