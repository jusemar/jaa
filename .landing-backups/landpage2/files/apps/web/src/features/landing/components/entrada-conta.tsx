"use client";
import Image from "next/image";
import Link from "next/link";
import { FluxoAutenticacao } from "@/features/autenticacao/components/fluxo-autenticacao";

// A volta à home pertence apenas à moldura pública e nunca cobre o aplicativo autenticado.
export function EntradaConta({ criar = false }: { criar?: boolean }) {
  return (
    <FluxoAutenticacao
      iniciarCadastro={criar}
      moldura={({ entrada }) => (
        <main className="flex min-h-dvh items-start justify-center bg-fundo px-4 py-10">
          <div className="my-auto flex w-full max-w-sm flex-col gap-4">
            <Link href="/" className="self-start text-sm text-conteudo-suave">
              ← Página inicial
            </Link>
            <h1 className="flex justify-center pb-1">
              <Image
                src="/jaaa-logo-login.png"
                alt="Jaaa"
                width={1020}
                height={275}
                priority
                className="h-auto w-56 max-w-[70%] sm:w-64"
              />
            </h1>
            {entrada}
          </div>
        </main>
      )}
    />
  );
}
