"use client";

/* eslint-disable @next/next/no-img-element */

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Categoria = {
  id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
};

type FormState = {
  codigo: string;
  nome: string;
  descricao: string;
  categoria_id: string;
  preco: string;
  ativo: boolean;
};

type ProdutoBanco = {
  id: string;
  codigo: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  categoria_id: string | null;
  preco: number;
  ativo: boolean;
  imagem_url: string | null;
};

function formatarPrecoParaCampo(valor: number) {
  return Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function extrairCaminhoStorage(urlImagem: string | null) {
  if (!urlImagem) {
    return null;
  }

  try {
    const url = new URL(urlImagem);
    const marcador = "/storage/v1/object/public/produtos/";
    const indice = url.pathname.indexOf(marcador);

    if (indice < 0) {
      return null;
    }

    return decodeURIComponent(
      url.pathname.substring(indice + marcador.length)
    );
  } catch {
    return null;
  }
}

export default function EditarProdutoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const produtoId = params?.id;

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [form, setForm] = useState<FormState>({
    codigo: "",
    nome: "",
    descricao: "",
    categoria_id: "",
    preco: "",
    ativo: true,
  });

  const [imagemAtual, setImagemAtual] = useState<string | null>(
    null
  );
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [removerImagem, setRemoverImagem] = useState(false);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [codigoOriginal, setCodigoOriginal] = useState("");

  const precoNumerico = useMemo(() => {
    const normalizado = form.preco
      .replace(/\./g, "")
      .replace(",", ".");

    const valor = Number(normalizado);

    return Number.isFinite(valor) ? valor : 0;
  }, [form.preco]);

  const categoriaSelecionada = useMemo(
    () =>
      categorias.find(
        (categoria) =>
          categoria.id === form.categoria_id
      ) ?? null,
    [categorias, form.categoria_id]
  );

  useEffect(() => {
    const carregar = window.setTimeout(async () => {
      if (!produtoId) {
        setErro("Produto inválido.");
        setCarregando(false);
        return;
      }

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

      const [
        categoriasResult,
        produtoResult,
      ] = await Promise.all([
        supabase
          .from("categorias_produto")
          .select("id, codigo, nome, ativo")
          .order("nome", {
            ascending: true,
          }),

        supabase
          .from("produtos")
          .select(
            "id, codigo, nome, descricao, categoria, categoria_id, preco, ativo, imagem_url"
          )
          .eq("id", produtoId)
          .maybeSingle(),
      ]);

      if (categoriasResult.error) {
        setErro(
          `Erro ao carregar categorias: ${categoriasResult.error.message}`
        );
        setCarregando(false);
        return;
      }

      if (produtoResult.error) {
        setErro(
          `Erro ao carregar produto: ${produtoResult.error.message}`
        );
        setCarregando(false);
        return;
      }

      if (!produtoResult.data) {
        setErro("Produto não encontrado.");
        setCarregando(false);
        return;
      }

      const categoriasCarregadas =
        (categoriasResult.data ?? []) as Categoria[];

      const produto =
        produtoResult.data as ProdutoBanco;

      let categoriaId = produto.categoria_id ?? "";

      if (!categoriaId && produto.categoria) {
        const categoriaLegada =
          categoriasCarregadas.find(
            (categoria) =>
              categoria.nome.trim().toLowerCase() ===
              produto.categoria?.trim().toLowerCase()
          );

        categoriaId = categoriaLegada?.id ?? "";
      }

      setCategorias(categoriasCarregadas);

      setForm({
        codigo: produto.codigo,
        nome: produto.nome,
        descricao: produto.descricao ?? "",
        categoria_id: categoriaId,
        preco: formatarPrecoParaCampo(produto.preco),
        ativo: produto.ativo,
      });

      setCodigoOriginal(produto.codigo);
      setImagemAtual(produto.imagem_url);
      setCarregando(false);
    }, 0);

    return () => {
      window.clearTimeout(carregar);
    };
  }, [produtoId, router]);

  function atualizarCampo<K extends keyof FormState>(
    campo: K,
    valor: FormState[K]
  ) {
    setForm((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  function aoSelecionarImagem(
    event: ChangeEvent<HTMLInputElement>
  ) {
    setErro("");
    setMensagem("");

    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setArquivo(null);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setPreviewUrl("");
      return;
    }

    const tiposPermitidos = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!tiposPermitidos.includes(file.type)) {
      setErro(
        "Formato de imagem inválido. Use JPG, PNG ou WEBP."
      );
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErro("A imagem deve ter no máximo 5 MB.");
      event.target.value = "";
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setArquivo(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRemoverImagem(false);
  }

  async function enviarNovaImagem(
    idProduto: string
  ): Promise<{
    url: string;
    caminho: string;
  }> {
    if (!arquivo) {
      throw new Error("Nenhuma imagem selecionada.");
    }

    const extensao =
      arquivo.name.split(".").pop()?.toLowerCase() || "jpg";

    const caminho = `${idProduto}/principal-${Date.now()}.${extensao}`;

    const { error: uploadError } = await supabase.storage
      .from("produtos")
      .upload(caminho, arquivo, {
        cacheControl: "3600",
        upsert: false,
        contentType: arquivo.type,
      });

    if (uploadError) {
      throw new Error(
        `Erro ao enviar imagem: ${uploadError.message}`
      );
    }

    const { data } = supabase.storage
      .from("produtos")
      .getPublicUrl(caminho);

    return {
      url: data.publicUrl,
      caminho,
    };
  }

  async function salvarProduto(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setErro("");
    setMensagem("");

    if (!produtoId) {
      setErro("Produto inválido.");
      return;
    }

    const codigo = form.codigo.trim().toUpperCase();
    const nome = form.nome.trim();
    const descricao = form.descricao.trim();

    if (!codigo) {
      setErro("Informe o código do produto.");
      return;
    }

    if (!nome) {
      setErro("Informe o nome do produto.");
      return;
    }

    if (!form.categoria_id) {
      setErro("Selecione a categoria do produto.");
      return;
    }

    if (!categoriaSelecionada) {
      setErro("A categoria selecionada não foi encontrada.");
      return;
    }

    if (precoNumerico < 0) {
      setErro("O preço não pode ser negativo.");
      return;
    }

    setSalvando(true);

    let novaImagem:
      | {
          url: string;
          caminho: string;
        }
      | null = null;

    try {
      if (codigo !== codigoOriginal) {
        const { data: existente, error: existenteError } =
          await supabase
            .from("produtos")
            .select("id, codigo")
            .ilike("codigo", codigo)
            .neq("id", produtoId)
            .maybeSingle();

        if (existenteError) {
          throw new Error(
            `Erro ao validar código: ${existenteError.message}`
          );
        }

        if (existente) {
          throw new Error(
            `Já existe um produto cadastrado com o código ${codigo}.`
          );
        }
      }

      if (arquivo) {
        novaImagem = await enviarNovaImagem(produtoId);
      }

      let imagemUrlFinal = imagemAtual;

      if (removerImagem) {
        imagemUrlFinal = null;
      }

      if (novaImagem) {
        imagemUrlFinal = novaImagem.url;
      }

      const { error: updateError } = await supabase
        .from("produtos")
        .update({
          codigo,
          nome,
          descricao: descricao || null,
          categoria_id: categoriaSelecionada.id,

          // Campo legado mantido temporariamente
          // para compatibilidade com as telas atuais.
          categoria: categoriaSelecionada.nome,

          preco: precoNumerico,
          ativo: form.ativo,
          imagem_url: imagemUrlFinal,
        })
        .eq("id", produtoId);

      if (updateError) {
        if (
          updateError.code === "23505" ||
          updateError.message
            .toLowerCase()
            .includes("duplicate")
        ) {
          throw new Error(
            `Já existe um produto cadastrado com o código ${codigo}.`
          );
        }

        throw new Error(
          `Erro ao salvar produto: ${updateError.message}`
        );
      }

      const caminhoImagemAnterior =
        extrairCaminhoStorage(imagemAtual);

      if (
        caminhoImagemAnterior &&
        (novaImagem || removerImagem)
      ) {
        await supabase.storage
          .from("produtos")
          .remove([caminhoImagemAnterior]);
      }

      setCodigoOriginal(codigo);
      setImagemAtual(imagemUrlFinal);
      setArquivo(null);
      setRemoverImagem(false);

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl("");
      }

      setMensagem("Produto atualizado com sucesso.");

      window.setTimeout(() => {
        router.push("/admin/produtos");
      }, 800);
    } catch (error) {
      if (novaImagem) {
        await supabase.storage
          .from("produtos")
          .remove([novaImagem.caminho]);
      }

      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o produto."
      );
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-6 text-black md:p-10">
        <p>Carregando produto...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black md:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold">
              Editar produto
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              Altere os dados do produto selecionado.
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

        <form
          onSubmit={salvarProduto}
          className="space-y-6 rounded-xl border border-gray-300 p-6"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Código *
              </label>

              <input
                value={form.codigo}
                onChange={(event) =>
                  atualizarCampo(
                    "codigo",
                    event.target.value.toUpperCase()
                  )
                }
                placeholder="Ex.: BOX-133"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
                maxLength={80}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Categoria *
              </label>

              <select
                value={form.categoria_id}
                onChange={(event) =>
                  atualizarCampo(
                    "categoria_id",
                    event.target.value
                  )
                }
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
              >
                <option value="">
                  Selecione uma categoria
                </option>

                {categorias.map((categoria) => (
                  <option
                    key={categoria.id}
                    value={categoria.id}
                    disabled={
                      !categoria.ativo &&
                      categoria.id !== form.categoria_id
                    }
                  >
                    {categoria.nome}
                    {!categoria.ativo
                      ? " (inativa)"
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Nome *
            </label>

            <input
              value={form.nome}
              onChange={(event) =>
                atualizarCampo(
                  "nome",
                  event.target.value
                )
              }
              placeholder="Nome do produto"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
              maxLength={200}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Descrição
            </label>

            <textarea
              value={form.descricao}
              onChange={(event) =>
                atualizarCampo(
                  "descricao",
                  event.target.value
                )
              }
              placeholder="Descrição do produto"
              rows={5}
              className="w-full resize-y rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
            />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Preço *
              </label>

              <input
                value={form.preco}
                onChange={(event) =>
                  atualizarCampo(
                    "preco",
                    event.target.value
                  )
                }
                placeholder="Ex.: 649,90"
                inputMode="decimal"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-black"
              />

              <p className="mt-2 text-xs text-gray-500">
                Valor interpretado:{" "}
                {precoNumerico.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold">
                Status
              </label>

              <label className="flex min-h-[50px] cursor-pointer items-center gap-3 rounded-lg border border-gray-300 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(event) =>
                    atualizarCampo(
                      "ativo",
                      event.target.checked
                    )
                  }
                  className="h-5 w-5"
                />

                <span className="font-medium">
                  Produto ativo
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold">
              Imagem principal
            </label>

            <div className="grid gap-5 md:grid-cols-[220px_1fr] md:items-start">
              <div className="flex h-52 items-center justify-center overflow-hidden rounded-xl border border-gray-300 bg-gray-50">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Nova imagem do produto"
                    className="h-full w-full object-cover"
                  />
                ) : imagemAtual && !removerImagem ? (
                  <img
                    src={imagemAtual}
                    alt={form.nome || "Produto"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="px-6 text-center text-sm text-gray-400">
                    Produto sem imagem.
                  </div>
                )}
              </div>

              <div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={aoSelecionarImagem}
                  className="block w-full rounded-lg border border-gray-300 px-4 py-3"
                />

                <p className="mt-3 text-sm text-gray-500">
                  Se escolher outra imagem, ela substituirá a atual.
                  Formatos aceitos: JPG, PNG e WEBP. Máximo: 5 MB.
                </p>

                {arquivo && (
                  <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm">
                    <p>
                      <strong>Nova imagem:</strong>{" "}
                      {arquivo.name}
                    </p>

                    <p className="mt-1">
                      <strong>Tamanho:</strong>{" "}
                      {(arquivo.size / 1024 / 1024).toFixed(
                        2
                      )}{" "}
                      MB
                    </p>
                  </div>
                )}

                {imagemAtual && !arquivo && (
                  <label className="mt-4 flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={removerImagem}
                      onChange={(event) =>
                        setRemoverImagem(
                          event.target.checked
                        )
                      }
                      className="h-5 w-5"
                    />

                    <span className="text-sm font-medium">
                      Remover imagem atual
                    </span>
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() =>
                router.push("/admin/produtos")
              }
              disabled={salvando}
              className="rounded-lg border border-gray-300 px-5 py-3 font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={salvando}
              className="rounded-lg bg-black px-5 py-3 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {salvando
                ? "Salvando..."
                : "Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
