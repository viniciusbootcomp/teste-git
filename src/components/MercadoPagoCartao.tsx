"use client";

import {
  Payment,
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
    selectedPaymentMethod: string,
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
 * INICIALIZAÇÃO DO SDK
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
   * CALLBACKS ESTÁVEIS
   * =====================================================
   *
   * O page.tsx possui contador que renderiza a tela
   * frequentemente. Guardamos callbacks em refs para
   * evitar remontagens desnecessárias do Brick.
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
   * CONFIGURAÇÃO DO PAYMENT BRICK
   * =====================================================
   *
   * Utilizamos um único Brick para:
   *
   * - cartão de crédito
   * - cartão de débito
   *
   * PIX continua no fluxo próprio do O Box Driver.
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
          creditCard:
            "all" as const,

          debitCard:
            "all" as const,
        },
      }),
      []
    );

  /*
   * =====================================================
   * SUBMIT
   * =====================================================
   *
   * O Payment Brick informa:
   *
   * - selectedPaymentMethod
   * - formData
   *
   * O page.tsx decide qual backend utilizar:
   *
   * credit_card -> /api/mercado-pago/cartao
   * debit_card  -> /api/mercado-pago/debito
   * =====================================================
   */

  const handleSubmit =
    useCallback(
      async (
        dados: unknown
      ) => {
        const payload =
          dados as {
            selectedPaymentMethod?: unknown;
            formData?: unknown;
          };

        const selectedPaymentMethod =
          typeof payload
            .selectedPaymentMethod ===
          "string"
            ? payload
                .selectedPaymentMethod
            : "";

        const formData =
          payload.formData &&
          typeof payload.formData ===
            "object"
            ? payload
                .formData as Record<
                  string,
                  unknown
                >
            : {};

        if (
          !selectedPaymentMethod
        ) {
          throw new Error(
            "Mercado Pago não informou o tipo de cartão selecionado."
          );
        }

        await onSubmitRef.current(
          selectedPaymentMethod,
          formData
        );
      },
      []
    );

  const handleReady =
    useCallback(() => {
      console.log(
        "Payment Brick de cartões carregado."
      );

      onReadyRef.current?.();
    }, []);

  const handleError =
    useCallback(
      (
        error: unknown
      ) => {
        console.error(
          "Erro no Payment Brick de cartões:",
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
      <Payment
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

export default memo(
  MercadoPagoCartao
);
