"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type Categoria = {
  id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
};

type ProdutoExistente = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  preco: number;
  ativo: boolean;
};

type StatusLinha = "novo" | "existente" | "erro";

type LinhaImportacao = {
  linha: number;
  codigo: string;
  nome: string;
  descricao: string;
  categoriaEntrada: string;
  categoriaId: string | null;
  categoriaNome: string | null;
  preco: number | null;
  ativo: boolean | null;
  status: StatusLinha;
  erro: string;
  produtoExistenteId: string | null;
};

type ModoExistentes = "ignorar" | "atualizar";

function normalizarTexto(valor: unknown) {
  return String(valor ?? "").trim();
}

function normalizarCodigo(valor: unknown) {
  return normalizarTexto(valor).toUpperCase();
}

function normalizarChave(valor: unknown) {
  return normalizarTexto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function converterPreco(valor: unknown): number | null {
  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor >= 0 ? valor : null;
  }

  const texto = normalizarTexto(valor);

  if (!texto) {
    return null;
  }

  const limpo = texto
    .replace(/R\$/gi, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const numero = Number(limpo);

  if (!Number.isFinite(numero) || numero < 0) {
    return null;
  }

  return numero;
}

function converterAtivo(valor: unknown): boolean | null {
  if (typeof valor === "boolean") {
    return valor;
  }

  if (typeof valor === "number") {
    if (valor === 1) return true;
    if (valor === 0) return false;
  }

  const texto = normalizarChave(valor);

  if (!texto) {
    return true;
  }

  if (
    ["sim", "s", "true", "1", "ativo", "ativa"].includes(texto)
  ) {
    return true;
  }

  if (
    ["nao", "n", "false", "0", "inativo", "inativa"].includes(texto)
  ) {
    return false;
  }

  return null;
}

function formatarValor(valor: number | null) {
  if (valor === null) {
    return "-";
  }

  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function larguraColunasPadrao() {
  return [
    { wch: 18 },
    { wch: 32 },
    { wch: 70 },
    { wch: 24 },
    { wch: 14 },
    { wch: 12 },
  ];
}

export default function ImportarProdutosPage() {
  const router = useRouter();

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [linhas, setLinhas] = useState<LinhaImportacao[]>([]);
  const [arquivoNome, setArquivoNome] = useState("");
  const [modoExistentes, setModoExistentes] =
    useState<ModoExistentes>("ignorar");

  const [carregando, setCarregando] = useState(true);
  const [processandoArquivo, setProcessandoArquivo] =
    useState(false);
  const [baixandoProdutos, setBaixandoProdutos] =
    useState(false);
  const [importando, setImportando] = useState(false);

  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    const carregar = window.setTimeout(async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: perfil, error: perfilError } =
        await supabase
          .from("perfil_cliente")
          .select("tipo_usuario")
          .eq("user_id", user.id)
          .maybeSingle();

      if (
        perfilError ||
        !perfil ||
        perfil.tipo_usuario !== "admin"
      ) {
        router.push("/area-cliente");
        return;
      }

      const { data, error } = await supabase
        .from("categorias_produto")
        .select("id, codigo, nome, ativo")
        .order("nome", { ascending: true });

      if (error) {
        setErro(
          `Erro ao carregar categorias: ${error.message}`
        );
        setCarregando(false);
        return;
      }

      setCategorias((data ?? []) as Categoria[]);
      setCarregando(false);
    }, 0);

    return () => {
      window.clearTimeout(carregar);
    };
  }, [router]);

  const resumo = useMemo(() => {
    return {
      total: linhas.length,
      novos: linhas.filter(
        (linha) => linha.status === "novo"
      ).length,
      existentes: linhas.filter(
        (linha) => linha.status === "existente"
      ).length,
      erros: linhas.filter(
        (linha) => linha.status === "erro"
      ).length,
    };
  }, [linhas]);

  const acao = useMemo(() => {
    if (resumo.erros > 0 || linhas.length === 0) {
      return {
        quantidade: 0,
        texto: "Confirmar importação",
      };
    }

    if (modoExistentes === "ignorar") {
      return {
        quantidade: resumo.novos,
        texto:
          resumo.novos > 0
            ? `Importar ${resumo.novos} novo${resumo.novos === 1 ? "" : "s"}`
            : "Nenhum produto novo para importar",
      };
    }

    const quantidade = resumo.novos + resumo.existentes;

    if (resumo.novos > 0 && resumo.existentes > 0) {
      return {
        quantidade,
        texto: `Importar ${resumo.novos} e atualizar ${resumo.existentes}`,
      };
    }

    if (resumo.novos > 0) {
      return {
        quantidade,
        texto: `Importar ${resumo.novos} novo${resumo.novos === 1 ? "" : "s"}`,
      };
    }

    if (resumo.existentes > 0) {
      return {
        quantidade,
        texto: `Atualizar ${resumo.existentes} produto${resumo.existentes === 1 ? "" : "s"}`,
      };
    }

    return {
      quantidade: 0,
      texto: "Nada para processar",
    };
  }, [linhas.length, modoExistentes, resumo]);

  function baixarModeloExcel() {
    const dados = [
      {
        codigo: "BOX-220",
        nome: "Kit Box 2,20 m",
        descricao:
          "Kit completo para box de banheiro com medida padrão de 2,20 m.",
        categoria: "KIT_BOX",
        preco: 899.9,
        ativo: "SIM",
      },
      {
        codigo: "SIL-PU-002",
        nome: "Silicone PU Branco",
        descricao:
          "Silicone branco para instalação e acabamento.",
        categoria: "ACESSORIOS",
        preco: 26.9,
        ativo: "SIM",
      },
    ];

    const planilha = XLSX.utils.json_to_sheet(dados);
    planilha["!cols"] = larguraColunasPadrao();

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      planilha,
      "Produtos"
    );

    XLSX.writeFile(
      workbook,
      "modelo_importacao_produtos_o_box_driver.xlsx"
    );
  }

  async function baixarProdutosExistentes() {
    setErro("");
    setMensagem("");
    setBaixandoProdutos(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: perfil, error: perfilError } =
        await supabase
          .from("perfil_cliente")
          .select("tipo_usuario")
          .eq("user_id", user.id)
          .maybeSingle();

      if (
        perfilError ||
        !perfil ||
        perfil.tipo_usuario !== "admin"
      ) {
        throw new Error(
          "Seu usuário não possui permissão para exportar produtos."
        );
      }

      const { data, error } = await supabase
        .from("produtos")
        .select(
          "id, codigo, nome, descricao, categoria, preco, ativo"
        )
        .order("codigo", { ascending: true });

      if (error) {
        throw new Error(
          `Erro ao carregar produtos existentes: ${error.message}`
        );
      }

      const produtos =
        (data ?? []) as ProdutoExistente[];

      if (produtos.length === 0) {
        throw new Error(
          "Não existem produtos cadastrados para exportar."
        );
      }

      const dadosExcel = produtos.map((produto) => ({
        codigo: produto.codigo,
        nome: produto.nome,
        descricao: produto.descricao ?? "",
        categoria: produto.categoria ?? "",
        preco: Number(produto.preco),
        ativo: produto.ativo ? "SIM" : "NÃO",
      }));

      const planilha =
        XLSX.utils.json_to_sheet(dadosExcel);

      planilha["!cols"] = larguraColunasPadrao();

      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        planilha,
        "Produtos"
      );

      const agora = new Date();

      const dataArquivo = [
        agora.getFullYear(),
        String(agora.getMonth() + 1).padStart(2, "0"),
        String(agora.getDate()).padStart(2, "0"),
      ].join("-");

      XLSX.writeFile(
        workbook,
        `produtos_o_box_driver_${dataArquivo}.xlsx`
      );

      setMensagem(
        `${produtos.length} produto(s) exportado(s) para Excel.`
      );
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível exportar os produtos."
      );
    } finally {
      setBaixandoProdutos(false);
    }
  }

  async function analisarArquivo(
    event: ChangeEvent<HTMLInputElement>
  ) {
    setErro("");
    setMensagem("");
    setLinhas([]);
    setArquivoNome("");

    const arquivo = event.target.files?.[0];

    if (!arquivo) {
      return;
    }

    const extensao = arquivo.name
      .split(".")
      .pop()
      ?.toLowerCase();

    if (!["xlsx", "xls"].includes(extensao ?? "")) {
      setErro(
        "Arquivo inválido. Selecione uma planilha .xlsx ou .xls."
      );
      event.target.value = "";
      return;
    }

    setProcessandoArquivo(true);

    try {
      const { data: produtosAtuais, error: produtosError } =
        await supabase
          .from("produtos")
          .select("id, codigo")
          .order("codigo", { ascending: true });

      if (produtosError) {
        throw new Error(
          `Erro ao consultar produtos atuais: ${produtosError.message}`
        );
      }

      const { data: categoriasAtuais, error: categoriasError } =
        await supabase
          .from("categorias_produto")
          .select("id, codigo, nome, ativo")
          .order("nome", { ascending: true });

      if (categoriasError) {
        throw new Error(
          `Erro ao consultar categorias atuais: ${categoriasError.message}`
        );
      }

      const categoriasValidacao =
        (categoriasAtuais ?? []) as Categoria[];

      const produtosValidacao =
        (produtosAtuais ?? []) as Pick<
          ProdutoExistente,
          "id" | "codigo"
        >[];

      setCategorias(categoriasValidacao);

      const buffer = await arquivo.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
      });

      const primeiraAba = workbook.SheetNames[0];

      if (!primeiraAba) {
        throw new Error(
          "O arquivo não possui nenhuma planilha."
        );
      }

      const worksheet = workbook.Sheets[primeiraAba];

      const dados = XLSX.utils.sheet_to_json<
        Record<string, unknown>
      >(worksheet, {
        defval: "",
        raw: true,
      });

      if (dados.length === 0) {
        throw new Error(
          "A planilha não possui produtos para importar."
        );
      }

      const mapaCategorias = new Map<
        string,
        Categoria
      >();

      categoriasValidacao.forEach((categoria) => {
        mapaCategorias.set(
          normalizarChave(categoria.codigo),
          categoria
        );

        mapaCategorias.set(
          normalizarChave(categoria.nome),
          categoria
        );
      });

      const mapaProdutos = new Map<
        string,
        Pick<ProdutoExistente, "id" | "codigo">
      >();

      produtosValidacao.forEach((produto) => {
        mapaProdutos.set(
          normalizarChave(produto.codigo),
          produto
        );
      });

      const codigosArquivo = new Set<string>();

      const linhasAnalisadas: LinhaImportacao[] =
        dados.map((registro, indice) => {
          const codigo = normalizarCodigo(
            registro.codigo
          );
          const nome = normalizarTexto(registro.nome);
          const descricao = normalizarTexto(
            registro.descricao
          );
          const categoriaEntrada = normalizarTexto(
            registro.categoria
          );
          const preco = converterPreco(registro.preco);
          const ativo = converterAtivo(registro.ativo);

          let status: StatusLinha = "novo";
          let erroLinha = "";
          let categoriaId: string | null = null;
          let categoriaNome: string | null = null;
          let produtoExistenteId: string | null = null;

          if (!codigo) {
            erroLinha = "Código não informado.";
          } else if (!nome) {
            erroLinha = "Nome não informado.";
          } else if (!categoriaEntrada) {
            erroLinha = "Categoria não informada.";
          } else if (preco === null) {
            erroLinha = "Preço inválido.";
          } else if (ativo === null) {
            erroLinha =
              'Status "ativo" inválido. Use SIM/NÃO, ATIVO/INATIVO, TRUE/FALSE ou 1/0.';
          }

          if (!erroLinha && codigo) {
            const chaveCodigo = normalizarChave(codigo);

            if (codigosArquivo.has(chaveCodigo)) {
              erroLinha =
                "Código duplicado dentro do próprio arquivo.";
            } else {
              codigosArquivo.add(chaveCodigo);
            }
          }

          if (!erroLinha && categoriaEntrada) {
            const categoria = mapaCategorias.get(
              normalizarChave(categoriaEntrada)
            );

            if (!categoria) {
              erroLinha = `Categoria "${categoriaEntrada}" não existe.`;
            } else if (!categoria.ativo) {
              erroLinha = `Categoria "${categoria.nome}" está inativa.`;
            } else {
              categoriaId = categoria.id;
              categoriaNome = categoria.nome;
            }
          }

          if (!erroLinha && codigo) {
            const existente = mapaProdutos.get(
              normalizarChave(codigo)
            );

            if (existente) {
              status = "existente";
              produtoExistenteId = existente.id;
            }
          }

          if (erroLinha) {
            status = "erro";
          }

          return {
            linha: indice + 2,
            codigo,
            nome,
            descricao,
            categoriaEntrada,
            categoriaId,
            categoriaNome,
            preco,
            ativo,
            status,
            erro: erroLinha,
            produtoExistenteId,
          };
        });

      setArquivoNome(arquivo.name);
      setLinhas(linhasAnalisadas);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível analisar a planilha."
      );
    } finally {
      setProcessandoArquivo(false);
    }
  }

  async function confirmarImportacao() {
    setErro("");
    setMensagem("");

    if (linhas.length === 0) {
      setErro("Selecione e analise um arquivo primeiro.");
      return;
    }

    if (resumo.erros > 0) {
      setErro(
        "Corrija as linhas com erro antes de confirmar a importação."
      );
      return;
    }

    const linhasNovas = linhas.filter(
      (linha) => linha.status === "novo"
    );

    const linhasExistentes = linhas.filter(
      (linha) => linha.status === "existente"
    );

    if (acao.quantidade === 0) {
      setErro(
        modoExistentes === "ignorar"
          ? "Todos os produtos da planilha já existem. Se quiser alterá-los, marque Atualizar existentes."
          : "Não há produtos para processar."
      );
      return;
    }

    const confirmado = window.confirm(
      modoExistentes === "atualizar"
        ? `Confirmar: ${linhasNovas.length} produto(s) novo(s) e ${linhasExistentes.length} produto(s) existente(s) atualizado(s)?`
        : `Confirmar importação de ${linhasNovas.length} produto(s) novo(s)? Os ${linhasExistentes.length} produto(s) já existentes serão ignorados.`
    );

    if (!confirmado) {
      return;
    }

    setImportando(true);

    try {
      if (linhasNovas.length > 0) {
        const novos = linhasNovas.map((linha) => ({
          codigo: linha.codigo,
          nome: linha.nome,
          descricao: linha.descricao || null,
          categoria_id: linha.categoriaId,
          categoria: linha.categoriaNome,
          preco: linha.preco,
          ativo: linha.ativo ?? true,
          imagem_url: null,
        }));

        const { error: insertError } = await supabase
          .from("produtos")
          .insert(novos);

        if (insertError) {
          throw new Error(
            `Erro ao cadastrar novos produtos: ${insertError.message}`
          );
        }
      }

      if (
        modoExistentes === "atualizar" &&
        linhasExistentes.length > 0
      ) {
        for (const linha of linhasExistentes) {
          if (!linha.produtoExistenteId) {
            continue;
          }

          const { error: updateError } = await supabase
            .from("produtos")
            .update({
              nome: linha.nome,
              descricao: linha.descricao || null,
              categoria_id: linha.categoriaId,
              categoria: linha.categoriaNome,
              preco: linha.preco,
              ativo: linha.ativo ?? true,
            })
            .eq("id", linha.produtoExistenteId);

          if (updateError) {
            throw new Error(
              `Erro ao atualizar o produto ${linha.codigo}: ${updateError.message}`
            );
          }
        }
      }

      const quantidadeAtualizada =
        modoExistentes === "atualizar"
          ? linhasExistentes.length
          : 0;

      setMensagem(
        `Processo concluído. ${linhasNovas.length} produto(s) cadastrado(s) e ${quantidadeAtualizada} produto(s) atualizado(s).`
      );

      window.setTimeout(() => {
        router.push("/admin/produtos");
      }, 1500);
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir o processamento."
      );
    } finally {
      setImportando(false);
    }
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-6 text-black md:p-10">
        <p>Carregando importação...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold">
              Importar / atualizar produtos
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Cadastre produtos novos ou atualize o cadastro atual a partir de uma planilha Excel.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push("/admin/produtos")
            }
            className="rounded-lg border border-gray-300 px-4 py-2 font-semibold hover:bg-gray-50"
          >
            Voltar
          </button>
        </div>

        {erro && (
          <div className="mb-6 rounded-lg border border-red-400 bg-red-50 p-4 text-red-700">
            {erro}
          </div>
        )}

        {mensagem && (
          <div className="mb-6 rounded-lg border border-green-400 bg-green-50 p-4 text-green-700">
            {mensagem}
          </div>
        )}

        <div className="mb-6 rounded-xl border border-gray-300 p-6">
          <h2 className="text-lg font-bold">
            Planilhas
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            Comece do zero com o modelo ou baixe os produtos atuais para fazer alterações em massa.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={baixarModeloExcel}
              disabled={baixandoProdutos || importando}
              className="rounded-lg border border-gray-300 px-4 py-3 font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              Baixar modelo Excel
            </button>

            <button
              type="button"
              onClick={baixarProdutosExistentes}
              disabled={baixandoProdutos || importando}
              className="rounded-lg bg-black px-4 py-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {baixandoProdutos
                ? "Gerando planilha..."
                : "Baixar produtos existentes"}
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-gray-300 p-6">
          <h2 className="text-lg font-bold">
            1. Selecione a planilha
          </h2>

          <p className="mt-2 text-sm text-gray-500">
            Colunas esperadas: codigo, nome, descricao, categoria, preco e ativo.
            A categoria pode ser informada pelo código ou pelo nome cadastrado.
          </p>

          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={analisarArquivo}
            disabled={processandoArquivo || importando}
            className="mt-4 block w-full rounded-lg border border-gray-300 px-4 py-3 disabled:bg-gray-100"
          />

          {processandoArquivo && (
            <p className="mt-3 text-sm font-semibold">
              Analisando planilha...
            </p>
          )}

          {arquivoNome && (
            <p className="mt-3 text-sm text-gray-600">
              Arquivo analisado:{" "}
              <strong>{arquivoNome}</strong>
            </p>
          )}
        </div>

        {linhas.length > 0 && (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-gray-300 p-5">
                <div className="text-sm text-gray-500">
                  Linhas
                </div>
                <div className="mt-1 text-3xl font-bold">
                  {resumo.total}
                </div>
              </div>

              <div className="rounded-xl border border-green-300 bg-green-50 p-5">
                <div className="text-sm text-green-700">
                  Novos
                </div>
                <div className="mt-1 text-3xl font-bold text-green-800">
                  {resumo.novos}
                </div>
              </div>

              <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-5">
                <div className="text-sm text-yellow-700">
                  Já existentes
                </div>
                <div className="mt-1 text-3xl font-bold text-yellow-800">
                  {resumo.existentes}
                </div>
              </div>

              <div className="rounded-xl border border-red-300 bg-red-50 p-5">
                <div className="text-sm text-red-700">
                  Com erro
                </div>
                <div className="mt-1 text-3xl font-bold text-red-800">
                  {resumo.erros}
                </div>
              </div>
            </div>

            <div className="mb-6 rounded-xl border border-gray-300 p-6">
              <h2 className="text-lg font-bold">
                2. Produtos que já existem
              </h2>

              <p className="mt-2 text-sm text-gray-500">
                O código é usado para identificar o produto existente.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-300 px-4 py-3">
                  <input
                    type="radio"
                    name="modoExistentes"
                    value="ignorar"
                    checked={modoExistentes === "ignorar"}
                    onChange={() => {
                      setErro("");
                      setModoExistentes("ignorar");
                    }}
                  />

                  <span>
                    <strong>Ignorar existentes</strong>
                    <span className="ml-2 text-sm text-gray-500">
                      Somente produtos novos serão cadastrados.
                    </span>
                  </span>
                </label>

                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-300 px-4 py-3">
                  <input
                    type="radio"
                    name="modoExistentes"
                    value="atualizar"
                    checked={modoExistentes === "atualizar"}
                    onChange={() => {
                      setErro("");
                      setModoExistentes("atualizar");
                    }}
                  />

                  <span>
                    <strong>Atualizar existentes</strong>
                    <span className="ml-2 text-sm text-gray-500">
                      Atualiza nome, descrição, categoria, preço e status.
                    </span>
                  </span>
                </label>
              </div>

              {resumo.novos === 0 &&
                resumo.existentes > 0 &&
                modoExistentes === "ignorar" && (
                  <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                    Todos os produtos da planilha já existem. Marque{" "}
                    <strong>Atualizar existentes</strong> para aplicar as alterações.
                  </div>
                )}

              <p className="mt-3 text-xs text-gray-500">
                A atualização por planilha não altera imagens dos produtos.
              </p>
            </div>

            <div className="mb-6 overflow-hidden rounded-xl border border-gray-300">
              <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">
                <h2 className="font-bold">
                  3. Prévia da importação
                </h2>
              </div>

              <div className="max-h-[520px] overflow-auto">
                <table className="w-full min-w-[1100px] border-collapse">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-200 text-left text-sm text-gray-600">
                      <th className="px-4 py-3">Linha</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Código</th>
                      <th className="px-4 py-3">Produto</th>
                      <th className="px-4 py-3">Categoria</th>
                      <th className="px-4 py-3">Preço</th>
                      <th className="px-4 py-3">Ativo</th>
                      <th className="px-4 py-3">Observação</th>
                    </tr>
                  </thead>

                  <tbody>
                    {linhas.map((linha) => (
                      <tr
                        key={`${linha.linha}-${linha.codigo}`}
                        className="border-b border-gray-100 text-sm"
                      >
                        <td className="px-4 py-3">
                          {linha.linha}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                              linha.status === "novo"
                                ? "bg-green-100 text-green-800"
                                : linha.status === "existente"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                            }`}
                          >
                            {linha.status === "novo"
                              ? "Novo"
                              : linha.status === "existente"
                                ? "Existente"
                                : "Erro"}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono font-semibold">
                          {linha.codigo || "-"}
                        </td>

                        <td className="px-4 py-3">
                          {linha.nome || "-"}
                        </td>

                        <td className="px-4 py-3">
                          {linha.categoriaNome ??
                            linha.categoriaEntrada ??
                            "-"}
                        </td>

                        <td className="px-4 py-3 font-semibold">
                          {formatarValor(linha.preco)}
                        </td>

                        <td className="px-4 py-3">
                          {linha.ativo === null
                            ? "-"
                            : linha.ativo
                              ? "Sim"
                              : "Não"}
                        </td>

                        <td className="px-4 py-3">
                          {linha.erro ? (
                            <span className="text-red-700">
                              {linha.erro}
                            </span>
                          ) : linha.status === "existente" ? (
                            <span className="text-gray-500">
                              Produto já cadastrado.
                            </span>
                          ) : (
                            <span className="text-gray-400">
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  router.push("/admin/produtos")
                }
                disabled={importando}
                className="rounded-lg border border-gray-300 px-5 py-3 font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={confirmarImportacao}
                disabled={
                  importando ||
                  resumo.erros > 0 ||
                  linhas.length === 0 ||
                  acao.quantidade === 0
                }
                className="rounded-lg bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {importando
                  ? "Processando..."
                  : acao.texto}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
