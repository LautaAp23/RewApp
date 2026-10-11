# RewApp
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users and purpose
Clientes que pagan en comercios y reciben recompensas; comercios que cobran y gestionan premios. La aplicación es una PWA móvil, con cuentas por passkey y liquidación en Monad Testnet.

## Confirmed scope
Canje del cliente, gestión de premios y entrega por comercios. Contactos, grupos y división de cobros de comercios; cada participante paga su parte y recibe sus propios puntos. Se excluyen puntos del comercio y transferencias entre personas.

## Constraints
La fuente canónica de producto es docs/MODEL.md. Preservar passkeys, firmas acotadas, montos bigint y monedas locales. Los contratos desplegados son la autoridad de saldos, costos y puntos. Nunca presentar pagos pendientes como confirmados. Todos los textos de interfaz se traducen a es/en/pt.

## Brand commitments
Conservar el sistema existente de docs/BRAND.md. Construir directamente sobre la interfaz actual, según elección del usuario.
