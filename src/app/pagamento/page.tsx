"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import { supabase } from "@/lib/supabase";
import MercadoPagoCartao from "@/components/MercadoPagoCartao";

type Reserva = {
  id: string;
  status: string;
  reservado_em: string;
  expira_em: string;
  pedido_id: string | null;
};

type ItemReserva = {
  id: string;
  quantidade: number;
  preco_unitario: number;
  nome_produto: string;
  codigo_produto: string;

  unidades: {
    codigo: string;
    nome: string;
    cidade: string | null;
    estado: string | null;
  } | null;
};

type RespostaPix = {
  sucesso: boolean;
  erro?: string;
  mensagem?: string;
  valor?: number | string;
  order_id?: string;
  payment_id?: string;
  status?: string;
  status_detail?: string;
  qr_code?: string;
  qr_code_base64?: string;
  ticket_url?: string;
  expira_em?: string;
};

type RespostaReconciliacao = {
  sucesso: boolean;
  aprovado?: boolean;
  ja_processado?: boolean;
  numero_pedido?: number;
  pedido_id?: string;
  erro?: string;
  mensagem?: string;
  order_status?: string;
  payment_status?: string;
  status_detail?: string;
};

type MetodoPagamento =
  | "pix"
  | "cartao";

type RespostaCartao = {
  sucesso: boolean;
  aprovado?: boolean;
  ja_processado?: boolean;
  recusado?: boolean;
  numero_pedido?: number;
  pedido_id?: string;
  pagamento_id?: string;
  reserva_id?: string;
  order_id?: string;
  payment_id?: string | null;
  status?: string;
  status_detail?: string | null;
  mensagem?: string;
  erro?: string;
  erro_mercado_pago?: string | null;
};

type RespostaDebito = RespostaCartao;

export default function PagamentoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reservaId =
    searchParams.get("reserva");

  const [reserva, setReserva] =
    useState<Reserva | null>(null);

  const [itens, setItens] =
    useState<ItemReserva[]>([]);

  const [carregando, setCarregando] =
    useState(true);

  const [processando, setProcessando] =
    useState(false);

  const [mensagem, setMensagem] =
    useState("");

  const [pix, setPix] =
    useState<RespostaPix | null>(null);

  const [gerandoPix, setGerandoPix] =
    useState(false);

  const [conciliando, setConciliando] =
    useState(false);

  const [copiado, setCopiado] =
    useState(false);

  const [
    metodoPagamento,
    setMetodoPagamento,
  ] =
    useState<MetodoPagamento>(
      "pix"
    );

  const [
    processandoCartao,
    setProcessandoCartao,
  ] =
    useState(false);

  const [
    processandoDebito,
    setProcessandoDebito,
  ] =
    useState(false);

  const [
    segundosRestantes,
    setSegundosRestantes,
  ] = useState(0);

  /*
   * =====================================================
   * CARREGA RESERVA
   * =====================================================
   */

  const carregarReserva =
    useCallback(async () => {
      if (!reservaId) {
        setMensagem(
          "Reserva não informada."
        );

        setCarregando(false);
        return;
      }

      const {
        data: { user },
        error: userError,
      } =
        await supabase.auth.getUser();

      if (
        userError ||
        !user
      ) {
        router.push(
          "/login"
        );

        return;
      }

      /*
       * RLS garante que o cliente só visualize
       * a própria reserva.
       */
      const {
        data: reservaData,
        error: reservaError,
      } = await supabase
        .from(
          "reservas_estoque"
        )
        .select(`
          id,
          status,
          reservado_em,
          expira_em,
          pedido_id
        `)
        .eq(
          "id",
          reservaId
        )
        .maybeSingle();

      if (
        reservaError
      ) {
        setMensagem(
          `Erro ao carregar reserva: ${reservaError.message}`
        );

        setCarregando(false);
        return;
      }

      if (
        !reservaData
      ) {
        setMensagem(
          "Reserva não encontrada."
        );

        setCarregando(false);
        return;
      }

      setReserva(
        reservaData as Reserva
      );

      /*
       * Itens e distribuição física da reserva.
       */
      const {
        data: itensData,
        error: itensError,
      } = await supabase
        .from(
          "itens_reserva_estoque"
        )
        .select(`
          id,
          quantidade,
          preco_unitario,
          nome_produto,
          codigo_produto,

          unidades (
            codigo,
            nome,
            cidade,
            estado
          )
        `)
        .eq(
          "reserva_id",
          reservaData.id
        )
        .order(
          "created_at",
          {
            ascending: true,
          }
        );

      if (
        itensError
      ) {
        setMensagem(
          `Erro ao carregar itens da reserva: ${itensError.message}`
        );

        setCarregando(false);
        return;
      }

      setItens(
        (itensData ??
          []) as unknown as ItemReserva[]
      );

      setCarregando(false);
    }, [
      reservaId,
      router,
    ]);

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          void carregarReserva();
        },
        0
      );

    return () => {
      window.clearTimeout(
        timer
      );
    };
  }, [
    carregarReserva,
  ]);

  /*
   * =====================================================
   * CONTADOR
   * =====================================================
   */

  useEffect(() => {
  if (!reserva) {
    return;
  }

  /*
   * Guardamos o valor depois que o TypeScript
   * já confirmou que reserva não é null.
   */
  const expiraEmReserva =
    reserva.expira_em;

  function atualizarTempo() {
    const expiraEm =
      new Date(
        expiraEmReserva
      ).getTime();

    const agora =
      Date.now();

    const diferenca =
      Math.max(
        0,
        Math.floor(
          (
            expiraEm -
            agora
          ) / 1000
        )
      );

    setSegundosRestantes(
      diferenca
    );
  }

  atualizarTempo();

  const intervalo =
    window.setInterval(
      atualizarTempo,
      1000
    );

  return () => {
    window.clearInterval(
      intervalo
    );
  };
}, [
  reserva,
]);
  /*
   * =====================================================
   * TOTAL
   * =====================================================
   */

  const total =
    useMemo(() => {
      return itens.reduce(
        (
          soma,
          item
        ) =>
          soma +
          Number(
            item.quantidade
          ) *
            Number(
              item.preco_unitario
            ),
        0
      );
    }, [itens]);

  /*
   * =====================================================
   * TEMPO FORMATADO
   * =====================================================
   */

  const tempoFormatado =
    useMemo(() => {
      const minutos =
        Math.floor(
          segundosRestantes /
            60
        );

      const segundos =
        segundosRestantes %
        60;

      return `${String(
        minutos
      ).padStart(
        2,
        "0"
      )}:${String(
        segundos
      ).padStart(
        2,
        "0"
      )}`;
    }, [
      segundosRestantes,
    ]);

  const reservaExpirada =
    segundosRestantes <= 0 ||
    reserva?.status ===
      "expirada";

  const reservaConvertida =
    reserva?.status ===
    "convertida";

  const reservaCancelada =
    reserva?.status ===
    "cancelada";

  /*
   * =====================================================
   * FINALIZAÇÃO LOCAL APÓS PAGAMENTO CONFIRMADO
   * =====================================================
   */

  const concluirPagamento =
    useCallback(
      async (
        numeroPedido?: number,
        pedidoId?: string
      ) => {
        let numeroFinal =
          numeroPedido;

        if (
          !numeroFinal &&
          pedidoId
        ) {
          const {
            data: pedidoData,
            error: pedidoError,
          } = await supabase
            .from("pedidos")
            .select("numero_pedido")
            .eq("id", pedidoId)
            .maybeSingle();

          if (
            !pedidoError &&
            pedidoData?.numero_pedido
          ) {
            numeroFinal =
              Number(
                pedidoData.numero_pedido
              );
          }
        }

        localStorage.removeItem(
          "carrinho"
        );

        localStorage.removeItem(
          "reserva_pagamento"
        );

        if (numeroFinal) {
          router.push(
            `/pedido-sucesso?numero=${numeroFinal}`
          );
          return;
        }

        router.push(
          "/area-cliente"
        );
      },
      [router]
    );

  /*
   * =====================================================
   * RECONCILIA PIX COM O MERCADO PAGO
   * =====================================================
   */

  const reconciliarPix =
    useCallback(
      async (
        silencioso = false
      ): Promise<boolean> => {
        if (
          !reservaId ||
          conciliando
        ) {
          return false;
        }

        setConciliando(true);

        try {
          const {
            data: sessionData,
            error: sessionError,
          } =
            await supabase.auth.getSession();

          if (
            sessionError ||
            !sessionData.session
          ) {
            if (!silencioso) {
              setMensagem(
                "Sua sessão expirou. Entre novamente para continuar."
              );
            }
            return false;
          }

          const resposta =
            await fetch(
              "/api/mercado-pago/reconciliar-pix",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                  Authorization:
                    `Bearer ${sessionData.session.access_token}`,
                },
                body:
                  JSON.stringify({
                    reserva_id:
                      reservaId,
                  }),
              }
            );

          let resultado:
            RespostaReconciliacao;

          try {
            resultado =
              (await resposta.json()) as RespostaReconciliacao;
          } catch {
            if (!silencioso) {
              setMensagem(
                "O servidor retornou uma resposta inválida ao verificar o PIX."
              );
            }
            return false;
          }

          if (
            resposta.status === 404
          ) {
            return false;
          }

          if (
            !resposta.ok ||
            !resultado.sucesso
          ) {
            if (!silencioso) {
              setMensagem(
                resultado.erro ??
                  resultado.mensagem ??
                  "Não foi possível verificar o pagamento."
              );
            }
            return false;
          }

          if (
            resultado.aprovado ||
            resultado.ja_processado
          ) {
            setMensagem(
              "Pagamento aprovado! Seu pedido foi criado com sucesso."
            );

            await concluirPagamento(
              resultado.numero_pedido,
              resultado.pedido_id
            );

            return true;
          }

          if (!silencioso) {
            setMensagem(
              "PIX gerado. Aguardando a confirmação do pagamento pelo Mercado Pago."
            );
          }

          return false;
        } catch (error) {
          console.error(
            "Erro ao verificar PIX:",
            error
          );

          if (!silencioso) {
            setMensagem(
              "Não foi possível consultar o pagamento neste momento. Tentaremos novamente automaticamente."
            );
          }

          return false;
        } finally {
          setConciliando(false);
        }
      },
      [
        reservaId,
        conciliando,
        concluirPagamento,
      ]
    );

  /*
   * =====================================================
   * GERA PIX REAL NO MERCADO PAGO
   * =====================================================
   */

  async function gerarPix() {
    setMensagem("");
    setCopiado(false);

    if (!reserva) {
      setMensagem(
        "Reserva não carregada."
      );
      return;
    }

    if (
      reserva.status !==
      "ativa"
    ) {
      setMensagem(
        `A reserva está com status "${reserva.status}".`
      );
      return;
    }

    if (
      segundosRestantes <= 0
    ) {
      setMensagem(
        "O prazo da reserva terminou. Volte ao carrinho e tente novamente."
      );
      return;
    }

    if (
      gerandoPix ||
      processando
    ) {
      return;
    }

    setGerandoPix(true);
    setProcessando(true);

    try {
      const {
        data: sessionData,
        error: sessionError,
      } =
        await supabase.auth.getSession();

      if (
        sessionError ||
        !sessionData.session
      ) {
        setMensagem(
          "Sua sessão expirou. Entre novamente para continuar."
        );
        return;
      }

      const resposta =
        await fetch(
          "/api/mercado-pago/pix",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
              Authorization:
                `Bearer ${sessionData.session.access_token}`,
            },
            body:
              JSON.stringify({
                reserva_id:
                  reserva.id,
              }),
          }
        );

      let resultado:
        RespostaPix;

      try {
        resultado =
          (await resposta.json()) as RespostaPix;
      } catch {
        setMensagem(
          "O servidor retornou uma resposta inválida ao gerar o PIX."
        );
        return;
      }

      if (
        !resposta.ok ||
        !resultado.sucesso
      ) {
        setMensagem(
          resultado.erro ??
            resultado.mensagem ??
            "Não foi possível gerar o PIX."
        );
        return;
      }

      setPix(
        resultado
      );

      setMensagem(
        "PIX criado. Faça o pagamento usando o QR Code ou o código Copia e Cola."
      );

      await carregarReserva();

      window.setTimeout(
        () => {
          void reconciliarPix(
            true
          );
        },
        1500
      );
    } catch (error) {
      console.error(
        "Erro ao gerar PIX:",
        error
      );

      setMensagem(
        "Houve uma falha de comunicação ao gerar o PIX. Tente novamente."
      );
    } finally {
      setGerandoPix(false);
      setProcessando(false);
    }
  }

  /*
   * =====================================================
   * PROCESSA CARTÃO DE CRÉDITO
   * =====================================================
   */

  const processarCartao =
    useCallback(
      async (
        formData: Record<string, unknown>
      ) => {
        setMensagem("");

        if (!reserva) {
          setMensagem(
            "Reserva não carregada."
          );
          return;
        }

        if (
          reserva.status !== "ativa"
        ) {
          setMensagem(
            `A reserva está com status "${reserva.status}".`
          );
          return;
        }

        if (
          new Date(
            reserva.expira_em
          ).getTime() <=
          Date.now()
        ) {
          setMensagem(
            "O prazo da reserva terminou. Volte ao carrinho e tente novamente."
          );
          return;
        }

        if (
          processandoCartao ||
          processando
        ) {
          return;
        }

        const token =
          typeof formData.token === "string"
            ? formData.token
            : "";

        const paymentMethodId =
          typeof formData.paymentMethodId === "string"
            ? formData.paymentMethodId
            : typeof formData.payment_method_id === "string"
              ? formData.payment_method_id
              : "";

        const installments =
          Number(
            formData.installments ?? 0
          );

        let payerEmail = "";

        const payer =
          formData.payer;

        if (
          payer &&
          typeof payer === "object" &&
          "email" in payer
        ) {
          const emailValue =
            (payer as { email?: unknown }).email;

          if (
            typeof emailValue === "string"
          ) {
            payerEmail =
              emailValue;
          }
        }

        if (
          !payerEmail &&
          typeof formData.payerEmail === "string"
        ) {
          payerEmail =
            formData.payerEmail;
        }

        if (
          !payerEmail &&
          typeof formData.email === "string"
        ) {
          payerEmail =
            formData.email;
        }

        if (
          !token ||
          !paymentMethodId ||
          !Number.isInteger(
            installments
          ) ||
          installments < 1 ||
          !payerEmail
        ) {
          setMensagem(
            "O Mercado Pago não retornou todos os dados necessários do cartão. Revise os campos e tente novamente."
          );
          return;
        }

        setProcessandoCartao(true);
        setProcessando(true);

        try {
          const {
            data: sessionData,
            error: sessionError,
          } =
            await supabase.auth.getSession();

          if (
            sessionError ||
            !sessionData.session
          ) {
            setMensagem(
              "Sua sessão expirou. Entre novamente para continuar."
            );
            return;
          }

          const resposta =
            await fetch(
              "/api/mercado-pago/cartao",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                  Authorization:
                    `Bearer ${sessionData.session.access_token}`,
                },
                body:
                  JSON.stringify({
                    reserva_id:
                      reserva.id,
                    token,
                    payment_method_id:
                      paymentMethodId,
                    installments,
                    payer_email:
                      payerEmail,
                  }),
              }
            );

          let resultado:
            RespostaCartao;

          try {
            resultado =
              (await resposta.json()) as RespostaCartao;
          } catch {
            setMensagem(
              "O servidor retornou uma resposta inválida ao processar o cartão."
            );
            return;
          }

          if (
            !resposta.ok ||
            !resultado.sucesso
          ) {
            setMensagem(
              resultado.mensagem ??
                resultado.erro ??
                "Não foi possível processar o pagamento com cartão."
            );
            return;
          }

          if (
            resultado.aprovado ||
            resultado.ja_processado
          ) {
            setMensagem(
              "Pagamento aprovado! Seu pedido foi criado com sucesso."
            );

            await concluirPagamento(
              resultado.numero_pedido,
              resultado.pedido_id
            );

            return;
          }

          if (
            resultado.recusado
          ) {
            setMensagem(
              resultado.status_detail
                ? `Pagamento recusado pelo Mercado Pago: ${resultado.status_detail}.`
                : "Pagamento recusado pelo Mercado Pago. Revise os dados ou tente outro cartão."
            );
            return;
          }

          setMensagem(
            "Pagamento enviado ao Mercado Pago e ainda está em processamento."
          );
        } catch (error) {
          console.error(
            "Erro ao processar cartão:",
            error
          );

          setMensagem(
            "Houve uma falha de comunicação ao processar o cartão. Tente novamente."
          );
        } finally {
          setProcessandoCartao(false);
          setProcessando(false);
        }
      },
      [
        reserva,
        processandoCartao,
        processando,
        concluirPagamento,
      ]
    );

  /*
   * =====================================================
   * PROCESSA CARTÃO DE DÉBITO
   * =====================================================
   */

  const processarDebito =
    useCallback(
      async (
        formData: Record<string, unknown>
      ) => {
        setMensagem("");

        if (!reserva) {
          setMensagem(
            "Reserva não carregada."
          );
          return;
        }

        if (
          reserva.status !== "ativa"
        ) {
          setMensagem(
            `A reserva está com status "${reserva.status}".`
          );
          return;
        }

        if (
          new Date(
            reserva.expira_em
          ).getTime() <=
          Date.now()
        ) {
          setMensagem(
            "O prazo da reserva terminou. Volte ao carrinho e tente novamente."
          );
          return;
        }

        if (
          processandoDebito ||
          processando
        ) {
          return;
        }

        const token =
          typeof formData.token === "string"
            ? formData.token
            : "";

        const paymentMethodId =
          typeof formData.paymentMethodId === "string"
            ? formData.paymentMethodId
            : typeof formData.payment_method_id === "string"
              ? formData.payment_method_id
              : "";

        let payerEmail = "";

        const payer =
          formData.payer;

        if (
          payer &&
          typeof payer === "object" &&
          "email" in payer
        ) {
          const emailValue =
            (payer as { email?: unknown }).email;

          if (
            typeof emailValue === "string"
          ) {
            payerEmail =
              emailValue;
          }
        }

        if (
          !payerEmail &&
          typeof formData.payerEmail === "string"
        ) {
          payerEmail =
            formData.payerEmail;
        }

        if (
          !payerEmail &&
          typeof formData.email === "string"
        ) {
          payerEmail =
            formData.email;
        }

        if (
          !token ||
          !paymentMethodId ||
          !payerEmail
        ) {
          setMensagem(
            "O Mercado Pago não retornou todos os dados necessários do cartão de débito. Revise os campos e tente novamente."
          );
          return;
        }

        setProcessandoDebito(true);
        setProcessando(true);

        try {
          const {
            data: sessionData,
            error: sessionError,
          } =
            await supabase.auth.getSession();

          if (
            sessionError ||
            !sessionData.session
          ) {
            setMensagem(
              "Sua sessão expirou. Entre novamente para continuar."
            );
            return;
          }

          const resposta =
            await fetch(
              "/api/mercado-pago/debito",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                  Authorization:
                    `Bearer ${sessionData.session.access_token}`,
                },
                body:
                  JSON.stringify({
                    reserva_id:
                      reserva.id,
                    token,
                    payment_method_id:
                      paymentMethodId,
                    payer_email:
                      payerEmail,
                  }),
              }
            );

          let resultado:
            RespostaDebito;

          try {
            resultado =
              (await resposta.json()) as RespostaDebito;
          } catch {
            setMensagem(
              "O servidor retornou uma resposta inválida ao processar o cartão de débito."
            );
            return;
          }

          if (
            !resposta.ok ||
            !resultado.sucesso
          ) {
            setMensagem(
              resultado.mensagem ??
                resultado.erro ??
                "Não foi possível processar o pagamento com cartão de débito."
            );
            return;
          }

          if (
            resultado.aprovado ||
            resultado.ja_processado
          ) {
            setMensagem(
              "Pagamento aprovado! Seu pedido foi criado com sucesso."
            );

            await concluirPagamento(
              resultado.numero_pedido,
              resultado.pedido_id
            );

            return;
          }

          if (
            resultado.recusado
          ) {
            setMensagem(
              resultado.status_detail
                ? `Pagamento recusado pelo Mercado Pago: ${resultado.status_detail}.`
                : "Pagamento recusado pelo Mercado Pago. Revise os dados ou tente outro cartão."
            );
            return;
          }

          setMensagem(
            "Pagamento de débito enviado ao Mercado Pago e ainda está em processamento."
          );
        } catch (error) {
          console.error(
            "Erro ao processar cartão de débito:",
            error
          );

          setMensagem(
            "Houve uma falha de comunicação ao processar o cartão de débito. Tente novamente."
          );
        } finally {
          setProcessandoDebito(false);
          setProcessando(false);
        }
      },
      [
        reserva,
        processandoDebito,
        processando,
        concluirPagamento,
      ]
    );

  /*
   * =====================================================
   * ROTEIA O PAYMENT BRICK PARA CRÉDITO OU DÉBITO
   * =====================================================
   *
   * O próprio Mercado Pago identifica o tipo de cartão.
   * Não inferimos o tipo pelo número ou pela bandeira.
   * =====================================================
   */

  const processarCartaoUnificado =
    useCallback(
      async (
        selectedPaymentMethod:
          string,
        formData:
          Record<
            string,
            unknown
          >
      ) => {
        const tipo =
          selectedPaymentMethod
            .trim()
            .toLowerCase();

        console.log(
          "Tipo de cartão selecionado pelo Mercado Pago:",
          tipo
        );

        if (
          tipo ===
            "credit_card" ||
          tipo ===
            "creditcard"
        ) {
          await processarCartao(
            formData
          );

          return;
        }

        if (
          tipo ===
            "debit_card" ||
          tipo ===
            "debitcard"
        ) {
          await processarDebito(
            formData
          );

          return;
        }

        setMensagem(
          `Tipo de pagamento com cartão não suportado: ${selectedPaymentMethod}.`
        );
      },
      [
        processarCartao,
        processarDebito,
      ]
    );

  /*
   * =====================================================
   * CALLBACK ESTÁVEL DO BRICK
   * =====================================================
   *
   * O contador da reserva atualiza a página a cada segundo.
   * Este callback é memorizado para não entregar uma função
   * nova ao Brick em cada renderização.
   * =====================================================
   */

  const handleErroCartaoBrick =
    useCallback(() => {
      setMensagem(
        "Não foi possível carregar ou processar o formulário do Mercado Pago."
      );
    }, []);

  /*
   * =====================================================
   * POLLING DE SEGURANÇA
   * =====================================================
   */

  useEffect(() => {
    if (
      !pix ||
      !reserva ||
      reserva.status !==
        "ativa" ||
      reservaExpirada
    ) {
      return;
    }

    const intervalo =
      window.setInterval(
        () => {
          void reconciliarPix(
            true
          );
        },
        4000
      );

    return () => {
      window.clearInterval(
        intervalo
      );
    };
  }, [
    pix,
    reserva,
    reservaExpirada,
    reconciliarPix,
  ]);

  async function copiarPix() {
    if (!pix?.qr_code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        pix.qr_code
      );

      setCopiado(true);

      window.setTimeout(
        () => {
          setCopiado(false);
        },
        2000
      );
    } catch {
      setMensagem(
        "Não foi possível copiar automaticamente. Selecione o código PIX e copie manualmente."
      );
    }
  }

  /*
   * =====================================================
   * CARREGANDO
   * =====================================================
   */

  if (carregando) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <p>
          Carregando pagamento...
        </p>
      </main>
    );
  }

  /*
   * =====================================================
   * RESERVA NÃO ENCONTRADA
   * =====================================================
   */

  if (!reserva) {
    return (
      <main className="min-h-screen bg-white p-10 text-black">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl border border-gray-300 p-6">
            <p>
              {mensagem ||
                "Reserva não encontrada."}
            </p>

            <Link
              href="/carrinho"
              className="mt-5 inline-block rounded-lg bg-black px-5 py-3 font-semibold text-white"
            >
              Voltar ao carrinho
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white p-10 text-black">
      <div className="mx-auto max-w-4xl">

        {/* =================================================
            CABEÇALHO
        ================================================= */}

        <div className="mb-8">
          <p className="text-sm text-gray-500">
            Pagamento
          </p>

          <h1 className="mt-1 text-3xl font-bold">
            Finalize sua compra
          </h1>
        </div>

        {mensagem && (
          <div className="mb-6 rounded-xl border border-orange-300 bg-orange-50 p-5">
            {mensagem}
          </div>
        )}

        {/* =================================================
            RESERVA ATIVA
        ================================================= */}

        {reserva.status ===
          "ativa" &&
          !reservaExpirada && (
            <div className="mb-8 rounded-2xl border-2 border-green-400 bg-green-50 p-6">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">

                <div>
                  <p className="text-sm font-semibold uppercase tracking-widest text-green-700">
                    Estoque reservado
                  </p>

                  <h2 className="mt-2 text-2xl font-bold">
                    Seus produtos estão garantidos por
                    alguns minutos
                  </h2>

                  <p className="mt-2 text-gray-600">
                    Finalize o pagamento antes do prazo
                    abaixo.
                  </p>
                </div>

                <div className="rounded-xl bg-white px-6 py-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
                    Tempo restante
                  </p>

                  <p className="mt-1 text-4xl font-bold tabular-nums">
                    {tempoFormatado}
                  </p>
                </div>

              </div>
            </div>
          )}

        {/* =================================================
            EXPIRADA
        ================================================= */}

        {reservaExpirada &&
          !reservaConvertida &&
          !reservaCancelada && (
            <div className="mb-8 rounded-2xl border-2 border-red-300 bg-red-50 p-6">
              <p className="text-sm font-semibold uppercase tracking-widest text-red-700">
                Reserva encerrada
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                O tempo para pagamento terminou
              </h2>

              <p className="mt-3 text-gray-600">
                O estoque reservado voltou a ficar
                disponível para outros clientes.
              </p>

              <Link
                href="/carrinho"
                className="mt-5 inline-block rounded-lg bg-black px-5 py-3 font-semibold text-white"
              >
                Voltar ao carrinho
              </Link>
            </div>
          )}

        {/* =================================================
            CONVERTIDA
        ================================================= */}

        {reservaConvertida && (
          <div className="mb-8 rounded-2xl border-2 border-green-400 bg-green-50 p-6">
            <p className="text-xl font-bold">
              Pagamento já confirmado
            </p>

            <p className="mt-2 text-gray-600">
              Esta reserva já foi convertida em pedido.
            </p>

            <p className="mt-2 text-sm text-gray-500">
              Se você chegou novamente a esta tela após
              uma falha de conexão, a venda já foi
              processada pelo servidor.
            </p>
          </div>
        )}

        {/* =================================================
            CANCELADA
        ================================================= */}

        {reservaCancelada && (
          <div className="mb-8 rounded-2xl border-2 border-red-300 bg-red-50 p-6">
            <p className="text-xl font-bold">
              Reserva cancelada
            </p>

            <p className="mt-2 text-gray-600">
              Esta reserva não está mais disponível para
              pagamento.
            </p>

            <Link
              href="/carrinho"
              className="mt-5 inline-block rounded-lg bg-black px-5 py-3 font-semibold text-white"
            >
              Voltar ao carrinho
            </Link>
          </div>
        )}

        {/* =================================================
            CONTEÚDO
        ================================================= */}

        <div className="grid gap-8 md:grid-cols-2">

          {/* =================================================
              PRODUTOS
          ================================================= */}

          <div>
            <h2 className="mb-4 text-xl font-bold">
              Produtos reservados
            </h2>

            <div className="space-y-4">
              {itens.map(
                (item) => {
                  const subtotal =
                    Number(
                      item.quantidade
                    ) *
                    Number(
                      item.preco_unitario
                    );

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-gray-300 p-5"
                    >
                      <div className="flex justify-between gap-4">

                        <div>
                          <p className="font-bold">
                            {item.nome_produto}
                          </p>

                          <p className="mt-1 text-sm text-gray-500">
                            Código:{" "}
                            {item.codigo_produto}
                          </p>
                        </div>

                        <p className="text-xl font-bold">
                          {item.quantidade}
                        </p>

                      </div>

                      {item.unidades && (
                        <div className="mt-4 rounded-lg bg-gray-50 p-3">
                          <p className="text-sm font-semibold">
                            {item.unidades.nome}
                          </p>

                          {item.unidades.cidade && (
                            <p className="text-sm text-gray-500">
                              {item.unidades.cidade}

                              {item.unidades.estado
                                ? ` - ${item.unidades.estado}`
                                : ""}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mt-4 flex justify-between border-t border-gray-200 pt-4">
                        <span className="text-sm text-gray-500">
                          {item.quantidade} x{" "}
                          {Number(
                            item.preco_unitario
                          ).toLocaleString(
                            "pt-BR",
                            {
                              style:
                                "currency",
                              currency:
                                "BRL",
                            }
                          )}
                        </span>

                        <strong>
                          {subtotal.toLocaleString(
                            "pt-BR",
                            {
                              style:
                                "currency",
                              currency:
                                "BRL",
                            }
                          )}
                        </strong>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </div>

          {/* =================================================
              PAGAMENTO
          ================================================= */}

          <div>
            <h2 className="mb-4 text-xl font-bold">
              Pagamento
            </h2>

            <div className="rounded-2xl border border-gray-300 p-6">

              <p className="text-sm text-gray-500">
                Total
              </p>

              <p className="mt-1 text-4xl font-bold">
                {total.toLocaleString(
                  "pt-BR",
                  {
                    style:
                      "currency",
                    currency:
                      "BRL",
                  }
                )}
              </p>

              <div className="mt-6">
                <p className="mb-3 text-sm font-semibold text-gray-700">
                  Escolha a forma de pagamento
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setMetodoPagamento(
                        "pix"
                      )
                    }
                    disabled={
                      Boolean(pix) ||
                      processando ||
                      processandoCartao ||
                      processandoDebito ||
                      reservaExpirada ||
                      reservaConvertida ||
                      reservaCancelada
                    }
                    className={`rounded-xl border p-4 text-left transition ${
                      metodoPagamento === "pix"
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-300 bg-white"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <p className="font-bold">
                      PIX
                    </p>

                    <p className="mt-1 text-sm text-gray-600">
                      Pagamento rápido via Mercado Pago.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setMetodoPagamento(
                        "cartao"
                      )
                    }
                    disabled={
                      Boolean(pix) ||
                      processando ||
                      processandoCartao ||
                      processandoDebito ||
                      reservaExpirada ||
                      reservaConvertida ||
                      reservaCancelada
                    }
                    className={`rounded-xl border p-4 text-left transition ${
                      metodoPagamento === "cartao"
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-300 bg-white"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <p className="font-bold">
                      Cartão
                    </p>

                    <p className="mt-1 text-sm text-gray-600">
                      Crédito ou débito pelo Mercado Pago.
                    </p>
                  </button>
                </div>
              </div>

              {metodoPagamento === "pix" && (
                <>
                  <div className="mt-6 rounded-xl border border-blue-300 bg-blue-50 p-4">
                    <p className="font-bold">
                      PIX Mercado Pago
                    </p>

                    <p className="mt-2 text-sm text-gray-600">
                      Gere o PIX e conclua o pagamento. A confirmação
                      será verificada automaticamente pelo O Box Driver.
                    </p>
                  </div>

                  {!pix ? (
                    <button
                      type="button"
                      onClick={() =>
                        void gerarPix()
                      }
                      disabled={
                        gerandoPix ||
                        processando ||
                        processandoCartao ||
                        processandoDebito ||
                        reservaExpirada ||
                        reservaConvertida ||
                        reservaCancelada
                      }
                      className="mt-6 w-full rounded-xl bg-black p-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {gerandoPix
                        ? "Gerando PIX..."
                        : "Gerar PIX"}
                    </button>
                  ) : (
                    <div className="mt-6 space-y-5">
                      <div className="rounded-xl border border-green-300 bg-green-50 p-4">
                        <p className="font-bold text-green-800">
                          PIX criado
                        </p>

                        <p className="mt-1 text-sm text-gray-600">
                          Aguardando confirmação do Mercado Pago.
                        </p>

                        {conciliando && (
                          <p className="mt-2 text-xs text-gray-500">
                            Verificando pagamento...
                          </p>
                        )}
                      </div>

                      {pix.qr_code_base64 && (
                        <div className="text-center">
                          <p className="mb-3 font-semibold">
                            QR Code
                          </p>

                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              pix.qr_code_base64.startsWith(
                                "data:"
                              )
                                ? pix.qr_code_base64
                                : `data:image/png;base64,${pix.qr_code_base64}`
                            }
                            alt="QR Code PIX"
                            className="mx-auto max-w-64 rounded-xl border border-gray-200 p-3"
                          />
                        </div>
                      )}

                      {pix.qr_code && (
                        <div>
                          <p className="mb-2 font-semibold">
                            PIX Copia e Cola
                          </p>

                          <textarea
                            readOnly
                            value={pix.qr_code}
                            rows={5}
                            className="w-full resize-none rounded-xl border border-gray-300 p-3 text-sm"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              void copiarPix()
                            }
                            className="mt-2 w-full rounded-xl border border-gray-300 p-3 font-semibold"
                          >
                            {copiado
                              ? "Código copiado!"
                              : "Copiar código PIX"}
                          </button>
                        </div>
                      )}

                      {pix.ticket_url && (
                        <a
                          href={pix.ticket_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block w-full rounded-xl border border-gray-300 p-3 text-center font-semibold"
                        >
                          Abrir página PIX do Mercado Pago
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          void reconciliarPix(
                            false
                          )
                        }
                        disabled={
                          conciliando
                        }
                        className="w-full rounded-xl bg-black p-3 font-semibold text-white disabled:bg-gray-400"
                      >
                        {conciliando
                          ? "Verificando pagamento..."
                          : "Já paguei — verificar agora"}
                      </button>
                    </div>
                  )}
                </>
              )}

              {metodoPagamento === "cartao" &&
                !pix && (
                  <div className="mt-6">
                    <div className="mb-4 rounded-xl border border-blue-300 bg-blue-50 p-4">
                      <p className="font-bold">
                        Cartão Mercado Pago
                      </p>

                      <p className="mt-2 text-sm text-gray-600">
                        Escolha crédito ou débito dentro do ambiente
                        seguro do Mercado Pago. O O Box Driver não
                        armazena número do cartão nem código de segurança.
                      </p>
                    </div>

                    {(processandoCartao ||
                      processandoDebito) && (
                      <div className="mb-4 rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm">
                        Processando pagamento com cartão...
                      </div>
                    )}

                    <MercadoPagoCartao
                      valor={total}
                      onSubmit={
                        processarCartaoUnificado
                      }
                      onError={
                        handleErroCartaoBrick
                      }
                    />
                  </div>
                )}

              {reserva.status ===
                "ativa" &&
                !reservaExpirada && (
                  <p className="mt-4 text-center text-sm text-gray-500">
                    O estoque continuará reservado enquanto
                    o contador estiver ativo.
                  </p>
                )}

            </div>

            <Link
              href="/carrinho"
              className="mt-5 block w-full rounded-xl border border-gray-300 p-3 text-center font-semibold"
            >
              Voltar ao carrinho
            </Link>
          </div>
        </div>

        {/* =================================================
            IDENTIFICAÇÃO DA RESERVA
        ================================================= */}

        <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">
            Reserva
          </p>

          <p className="mt-1 break-all text-sm">
            {reserva.id}
          </p>
        </div>

      </div>
    </main>
  );
}