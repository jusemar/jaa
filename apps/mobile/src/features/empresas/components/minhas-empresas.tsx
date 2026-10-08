import { AVISO_LIMITE_DE_EMPRESAS, podeCriarEmpresa, type Empresa } from "@jaa/contratos";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Botao } from "@/components/ui/botao";
import { CampoTexto } from "@/components/ui/campo-texto";
import { Icone } from "@/components/ui/icone";
import { Aviso, Carregando, Cartao, EstadoVazio } from "@/components/ui/superficies";
import { Texto } from "@/components/ui/texto";
import { ALTURA_TOQUE, Cores, Espaco } from "@/constants/theme";
import { useContextoConta } from "@/features/conta/components/provedor-contexto-conta";
import { useIdentidadeAtiva } from "@/features/identidades/components/provedor-identidade-ativa";
import { criarEmpresa, listarMinhasEmpresas, obterEmpresa } from "../lib/api-empresas";
import { ROTULO_PAPEL, ROTULO_STATUS_EMPRESA, formularioEmpresaPronto } from "../lib/minhas-empresas";
import { sugerirSlug } from "../lib/sugerir-slug";

/*
 * "MINHAS EMPRESAS" — criar e abrir as empresas desta CONTA, como na Web. A administração de cada
 * empresa acontece quando a pessoa passa a AGIR COMO ela (seletor do topo; aqui há o atalho). Nada de
 * autorização no app: a lista, o papel e o que se pode abrir vêm do servidor.
 */
// Placeholders são modelos fictícios, nunca dado de empresa; e o preenchimento automático do aparelho
// não pode trazer para cá o que foi digitado em outro lugar.
const SEM_PREENCHIMENTO_AUTOMATICO = { autoComplete: "off", importantForAutofill: "no" } as const;

export function MinhasEmpresas() {
  const { recarregar: recarregarContexto } = useContextoConta();
  const { operaveis, selecionar } = useIdentidadeAtiva();
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [aberta, setAberta] = useState<Empresa | null>(null);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [slug, setSlug] = useState("");
  // Enquanto a pessoa não editar o endereço, ele acompanha a sugestão feita a partir do nome.
  const [slugEditado, setSlugEditado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Só depois de a lista chegar: antes disso não se sabe se a conta já criou a dela.
  const podeCriar = empresas !== null && podeCriarEmpresa(empresas);
  // Já criou a dela: o botão continua à vista, DESATIVADO, com o motivo ao lado (a API recusaria).
  const limiteAtingido = empresas !== null && !podeCriar;

  async function carregar() {
    const resultado = await listarMinhasEmpresas();
    if (resultado.ok) setEmpresas(resultado.dados.empresas);
    else setErro(resultado.mensagem);
  }

  useEffect(() => {
    let ativo = true;
    void listarMinhasEmpresas().then((resultado) => {
      if (!ativo) return;
      if (resultado.ok) setEmpresas(resultado.dados.empresas);
      else setErro(resultado.mensagem);
    });
    return () => {
      ativo = false;
    };
  }, []);

  async function abrir(empresa: Empresa) {
    if (aberta?.id === empresa.id) {
      setAberta(null);
      return;
    }
    // Sempre relê do servidor: a lista local não é autorização.
    const resultado = await obterEmpresa(empresa.id);
    if (!resultado.ok) {
      setErro(resultado.mensagem);
      setAberta(null);
      return;
    }
    setErro(null);
    setAberta(resultado.dados);
  }

  // Empresa NOVA começa em branco: nada do que foi digitado antes (nem de outra empresa) volta ao abrir.
  function abrirFormulario() {
    if (!podeCriar) return;
    setNome("");
    setNomeUsuario("");
    setSlug("");
    setSlugEditado(false);
    setErro(null);
    setCriando(true);
  }

  async function criar() {
    if (enviando || !formularioEmpresaPronto({ nome, nomeUsuario, slug })) return;
    setErro(null);
    setEnviando(true);
    try {
      const resultado = await criarEmpresa({ nome, nomeUsuario, slug });
      if (!resultado.ok) {
        setErro(resultado.status === 0 ? "Sem conexão. Tente de novo." : resultado.mensagem);
        return;
      }
      setNome("");
      setNomeUsuario("");
      setSlug("");
      setSlugEditado(false);
      setCriando(false);
      setAberta(resultado.dados);
      await carregar();
      // A empresa nova passa a aparecer no seletor "Agindo como".
      await recarregarContexto();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <View style={estilos.bloco}>
      {!(podeCriar && criando) && <Botao rotulo="Criar empresa" aparencia="secundario" disabled={!podeCriar} onPress={abrirFormulario} />}
      {limiteAtingido && (
        <Texto variante="pequeno" cor="conteudoSuave" accessibilityLiveRegion="polite">
          {AVISO_LIMITE_DE_EMPRESAS}
        </Texto>
      )}

      {podeCriar && criando && (
        <Cartao style={estilos.cartao}>
          <CampoTexto
            rotulo="Nome da empresa"
            value={nome}
            maxLength={50}
            placeholder="Nome do seu negócio"
            {...SEM_PREENCHIMENTO_AUTOMATICO}
            onChangeText={(texto) => {
              setNome(texto);
              if (!slugEditado) setSlug(sugerirSlug(texto));
            }}
          />
          <CampoTexto rotulo="@usuario da empresa" value={nomeUsuario} maxLength={31} autoCapitalize="none" autoCorrect={false} placeholder="@seunegocio" {...SEM_PREENCHIMENTO_AUTOMATICO} onChangeText={setNomeUsuario} dica="É o endereço público da empresa no Jaaa." />
          <CampoTexto
            rotulo="Endereço da loja"
            value={slug}
            maxLength={60}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="seu-negocio"
            {...SEM_PREENCHIMENTO_AUTOMATICO}
            onChangeText={(texto) => {
              setSlug(texto);
              setSlugEditado(true);
            }}
            dica="Só letras minúsculas, números e hífen."
          />
          <View style={estilos.acoes}>
            <Botao rotulo="Criar empresa" carregando={enviando} textoCarregando="Criando…" disabled={enviando || !formularioEmpresaPronto({ nome, nomeUsuario, slug })} onPress={() => void criar()} />
            <Botao rotulo="Cancelar" aparencia="discreto" disabled={enviando} onPress={() => setCriando(false)} />
          </View>
        </Cartao>
      )}

      {empresas === null && !erro && <Carregando />}
      {empresas?.length === 0 && !criando && <EstadoVazio titulo="Nenhuma empresa" descricao="Crie uma empresa para vender pelo Jaaa." />}


      {empresas && empresas.length > 0 && (
        <Cartao>
          {empresas.map((empresa, indice) => {
            const detalhe = aberta?.id === empresa.id ? aberta : null;
            const operavel = operaveis.some((identidade) => identidade.identidadeId === empresa.identidadeId);
            return (
              <View key={empresa.id} style={indice > 0 && estilos.separada}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: detalhe !== null }} accessibilityLabel={`${empresa.nome}, @${empresa.nomeUsuario}`} onPress={() => void abrir(empresa)} style={({ pressed }) => [estilos.item, pressed && estilos.apagado]}>
                  <Icone nome="loja" tamanho={22} cor="conteudo" />
                  <View style={estilos.flex}>
                    <Texto variante="corpoMedio" numberOfLines={1}>
                      {empresa.nome}
                    </Texto>
                    <Texto variante="pequeno" cor="conteudoSuave" numberOfLines={1}>
                      @{empresa.nomeUsuario}
                    </Texto>
                  </View>
                  <Icone nome="expandir" tamanho={18} />
                </Pressable>
                {detalhe && (
                  <View accessibilityLabel="Empresa aberta" style={estilos.detalhe}>
                    <Linha rotulo="Seu papel" valor={ROTULO_PAPEL[detalhe.papel] ?? detalhe.papel} />
                    <Linha rotulo="Status" valor={ROTULO_STATUS_EMPRESA[detalhe.status] ?? detalhe.status} />
                    <Linha rotulo="Loja (futura)" valor={`/loja/${detalhe.slug}`} />
                    {/* Só oferece o que o servidor disse que esta conta pode operar. */}
                    {operavel && <Botao rotulo="Agir como esta empresa" aparencia="realce" onPress={() => void selecionar(detalhe.identidadeId)} />}
                    <Texto variante="pequeno" cor="conteudoSuave">
                      Agindo como a empresa você conversa com os clientes e edita o perfil dela. Produtos, pedidos e logística são administrados no Jaaa Web.
                    </Texto>
                  </View>
                )}
              </View>
            );
          })}
        </Cartao>
      )}

      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </View>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.linha}>
      <Texto variante="pequeno" cor="conteudoSuave" style={estilos.rotulo}>
        {rotulo}
      </Texto>
      <Texto style={estilos.flex}>{valor}</Texto>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  apagado: { opacity: 0.6 },
  bloco: { gap: Espaco.tres },
  cartao: { gap: Espaco.tres, padding: Espaco.quatro },
  acoes: { flexDirection: "row", flexWrap: "wrap", gap: Espaco.dois },
  separada: { borderTopColor: Cores.borda, borderTopWidth: StyleSheet.hairlineWidth },
  item: { alignItems: "center", flexDirection: "row", gap: Espaco.tres, minHeight: ALTURA_TOQUE + 12, paddingHorizontal: Espaco.quatro },
  detalhe: { backgroundColor: Cores.superficieSuave, gap: Espaco.dois, padding: Espaco.quatro },
  linha: { flexDirection: "row", gap: Espaco.tres },
  rotulo: { width: 96 },
});
