"use client";

import {
  CardPayment,
  initMercadoPago,
} from "@mercadopago/sdk-react";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

type MercadoPagoCartaoProps = {
  valor: number;

  onSubmit: (
    formData: Record<string, unknown>
  ) => Promise<void>;

  onReady?: () => void;

  onError?: (
    error: unknown
  ) => void;
};

const publicKey =
  process.env
    .NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;

/*
 * =====================================================
 * INICIALIZAÇÃO ÚNICA DO SDK
 * =====================================================
 *
 * Este código roda no módulo do componente.
 * Não reinicializamos o Mercado Pago a cada render.
 * =====================================================
 */

if (publicKey) {
  initMercadoPago(
    publicKey,
    {
      locale: "pt-BR",
    }
  );
}

function MercadoPagoCartao({
  valor,
  onSubmit,
  onReady,
  onError,
}: MercadoPagoCartaoProps) {
  /*
   * =====================================================
   * REFERÊNCIAS DOS CALLBACKS
   * =====================================================
   *
   * O componente pai possui um contador que muda a cada
   * segundo. Guardamos os callbacks em refs para o Brick
   * receber funções estáveis e não tentar remontar por
   * causa de uma nova identidade de função.
   * =====================================================
   */

  const onSubmitRef =
    useRef(onSubmit);

  const onReadyRef =
    useRef(onReady);

  const onErrorRef =
    useRef(onError);

  useEffect(() => {
    onSubmitRef.current =
      onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    onReadyRef.current =
      onReady;
  }, [onReady]);

  useEffect(() => {
    onErrorRef.current =
      onError;
  }, [onError]);

  /*
   * =====================================================
   * CONFIGURAÇÕES ESTÁVEIS
   * =====================================================
   */

  const initialization =
    useMemo(
      () => ({
        amount: Number(
          valor.toFixed(2)
        ),
      }),
      [valor]
    );

  const customization =
    useMemo(
      () => ({
        paymentMethods: {
          types: {
            excluded: [
              "debit_card",
              "prepaid_card",
            ] as (
              | "debit_card"
              | "prepaid_card"
            )[],
          },
        },
      }),
      []
    );

  /*
   * =====================================================
   * CALLBACKS ENTREGUES AO BRICK
   * =====================================================
   *
   * Estes callbacks mantêm a mesma identidade entre
   * renderizações.
   * =====================================================
   */

  const handleSubmit =
    useCallback(
      async (
        formData: unknown
      ) => {
        await onSubmitRef.current(
          formData as Record<
            string,
            unknown
          >
        );
      },
      []
    );

  const handleReady =
    useCallback(() => {
      console.log(
        "Card Payment Brick carregado."
      );

      onReadyRef.current?.();
    }, []);

  const handleError =
    useCallback(
      (
        error: unknown
      ) => {
        console.error(
          "Erro no Card Payment Brick:",
          error
        );

        onErrorRef.current?.(
          error
        );
      },
      []
    );

  if (!publicKey) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4">
        <p className="font-semibold text-red-800">
          Mercado Pago não configurado
        </p>

        <p className="mt-2 text-sm text-red-700">
          A chave pública do Mercado Pago
          não está disponível.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-300 bg-white p-4">
      <CardPayment
        initialization={
          initialization
        }
        customization={
          customization
        }
        onSubmit={
          handleSubmit
        }
        onReady={
          handleReady
        }
        onError={
          handleError
        }
      />
    </div>
  );
}

/*
 * Evita renderização desnecessária quando o componente pai
 * atualiza apenas o contador da reserva.
 */
export default memo(
  MercadoPagoCartao
);
