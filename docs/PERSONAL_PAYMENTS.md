# Contactos y pagos entre personas

Ampliación solicitada el 12 de octubre de 2026. Agrega transferencias personales y solicitudes
de pago, además de los pagos a comercios; esta ampliación es una excepción explícita al filtro
original de funciones sociales de MODEL.md. No genera puntos, cashback ni comisiones comerciales.

## Identidad y contactos

- `Profile.alias` sigue siendo el nombre visible y no es único. `Profile.handle` es el alias de
  cuenta único, normalizado a minúsculas, con índice único y validación en PostgreSQL. Acepta
  3–24 caracteres ASCII, empieza y termina con letra/número, y admite `.`, `_` y `-` dentro.
  El prefijo `rw-` está reservado para evitar confundir alias con códigos de cuenta.
- Se administra desde Contactos y tiene acceso desde Mi perfil. No se asignan alias tomando
  nombres existentes, para evitar colisiones o cambiar la identidad de otros usuarios.
- Contactos acepta `@alias`, alias sin `@`, código `RW-…` o dirección de cuenta. Se resuelve en
  el servidor y exige un perfil registrado. La etiqueta personal es opcional y no es un alias.
  El contacto persiste por dirección, así que cambiar el alias no rompe contactos anteriores.
- Las escrituras usan `WorkspaceAction` firmado y protección contra reutilización. La preparación
  de una transferencia directa usa la sesión activa; mover dinero exige una passkey fresca al
  deslizar. Si la sesión venció, también se pide reingreso para preparar. Otras escrituras
  mantienen su confirmación con passkey.
- El listado abre un detalle en overlay con acciones, fecha de alta (si se conoce) y los últimos
  30 pagos confirmados entre ambas cuentas, con acceso a sus comprobantes. El endpoint privado
  exige sesión y pertenencia del contacto; nunca devuelve movimientos con terceros.
- Seleccionar contactos habilita un menú para eliminar en lote, crear un grupo o agregarlos a
  uno propio. Los grupos actuales son listas privadas del propietario, no invitaciones sociales
  con aceptación o notificaciones a sus integrantes.
- `Contact.createdAt` registra nuevas altas; las anteriores conservan `null`, sin inventar fechas.
- `PaymentRequestBlock` vincula por FK al perfil que bloquea y al remitente. Persiste aunque se
  elimine el contacto. Bloquear cancela sus solicitudes pendientes y evita nuevas solicitudes
  dirigidas; no altera transferencias, pagos en proceso ni QR abiertos que se escaneen a voluntad.
  Creación y bloqueo serializan con un bloqueo de fila del perfil del pagador en la transacción.

## Flujos

- Inicio muestra accesos táctiles a Transferir, Cobrar y Contactos debajo de Cargar saldo.
- Transferir exige un contacto, importe positivo y concepto opcional. Prepara una operación de
  15 minutos y muestra destinatario/código de cuenta antes de confirmar deslizando y con passkey.
- Cobrar genera un `PersonalCharge` de 24 horas. Puede dirigirse a un contacto, que recibirá
  un aviso y será el único autorizado a pagarlo, o quedar abierto para cualquiera con el QR.
  El selector de contacto tiene búsqueda y avatares; el botón QR a su derecha elige el modo
  abierto. Un cobro dirigido muestra la confirmación del aviso sin generar ni compartir QR;
  un cobro abierto muestra el QR y no envía notificaciones a contactos.
- El QR usa `/pagar/p2p_<id>`. Cámara y lectura desde imagen usan el mismo analizador de QR;
  la página distingue el prefijo personal. Los QR comerciales `/pagar/<id>` conservan su API,
  contrato, firmas, recompensas y lógica de división.
- Se puede compartir el cobro abierto o cancelar cualquier cobro mientras está pendiente. La BDD impide que cancelar
  y pagar ganen a la vez. Un cobro vencido o cancelado no puede iniciar un pago.
- Las solicitudes entran en Notificaciones mientras la app está abierta, con consulta cada
  15 segundos y al recuperar el foco. `readAt` se guarda en PostgreSQL y se comparte entre
  dispositivos; esto no es una notificación push del sistema. Los avisos anteriores de premios
  y novedades conservan su registro local de lectura.
  Abrir Avisos no marca nada como leído: se reconoce únicamente el aviso tocado. Cabecera y
  listado comparten lecturas confirmadas/en curso por cuenta; una respuesta anterior al toque
  no puede revertirlas y tocar un aviso local no borra las lecturas de cobros. Una escritura
  fallida vuelve a dejar el cobro sin leer. Las lecturas personales no dependen de localStorage.
- Al confirmar una división se desactiva la confirmación, se baja al pago compartido creado y
  se muestra un punto «Nuevo» solo durante esa visita. No se persiste ese indicador. Una división
  ya existente también desactiva la confirmación al volver a abrir la página.
- Cada parte de un pago compartido genera un aviso para su `expectedPayer`, incluyendo la parte
  del organizador. Muestra comercio e importe individual y abre `/pagar/<id-de-la-parte>`.
  El inbox firmado consulta solo partes pendientes y vigentes asignadas a esa cuenta; nunca
  notifica el cobro padre ni las partes ajenas. Leer guarda `Charge.notificationReadAt` solo
  al tocar ese aviso, con verificación del pagador. Los ids `split:<id>` evitan confundir estas
  lecturas con las solicitudes personales. Al pagar o vencer, el aviso deja de estar pendiente.
  La campana se actualiza cada 15 segundos y al recuperar el foco; no es push del sistema.
- Un `PAID` aparece en Movimientos de ambas cuentas y abre el comprobante existente en overlay,
  imprimible y compartible, con remitente/destinatario y códigos de cuenta, sin RewPoints.
  El historial personal requiere la sesión privada de esa cuenta; el comprobante requiere
  además firma `ViewReceipt` y prueba del evento `Transfer` exacto del token configurado.
- Al confirmar un pago personal se reemplaza el formulario por la misma pantalla de éxito del
  pago comercial, con tilde, comprobante, compartir PDF y vuelta al inicio. Transferir y Cobrar
  no muestran comprobantes recientes; el historial permanece en Movimientos. Cobrar lista
  únicamente solicitudes pendientes/en proceso. Los formularios reinician importe y concepto
  al cambiar de cuenta o destinatario; cada id de pago monta su propio estado.
- En desarrollo local y testnet, el botón de testing de Inicio permite elegir QR comercial o
  solicitud entrante de un contacto demo (ARS 5.000). `/api/dev/personal-request` exige sesión,
  mismo origen, BDD local y respeta bloqueos y un límite de cinco solicitudes por minuto.
  Solo crea una solicitud pendiente; pagarla requiere el flujo normal y una passkey fresca.

## Liquidación y límites de confianza

Se utiliza USDr existente, sin modificar ni desplegar contratos. El usuario confirma con una
passkey fresca dos firmas: intención que vincula cuenta, destinatario, id, importe, relayer,
nonce y vencimiento, y permiso EIP-2612 por ese importe exacto al relayer. El servicio verifica
ambas, simula, envía `permit` y luego `transferFrom` pagando el costo de ambas operaciones.

Este flujo **confía en el relayer**: el permiso ERC-20 autoriza un importe al servicio, y el
destinatario se controla en la API, no en el contrato. Tampoco es atómico: si se interrumpe
después de `permit`, queda una autorización limitada pendiente. No es equivalente al pago
comercial atómico de `RewAppPay` ni cumple su hipótesis de BDD no confiable para antirreplay.
Una futura versión debe mover intención y antirreplay a un contrato de transferencia atómica
antes de usar este mecanismo para dinero real. La app actual continúa en Monad Testnet.

Para recuperación, `payerLock` único reserva una sola operación por pagador, la transición
`PENDING → PROCESSING` es condicional, y un advisory lock de PostgreSQL impide ejecutar el mismo
id desde dos instancias. Se vuelven a verificar firmas y destino al retomar. Hash y transacción
firmada se persisten antes de enviar; ante timeout se reenvía la misma transacción. No se
libera la reserva ante resultados desconocidos. Solo un evento confirmado con token, pagador,
destinatario e importe exactos produce `PAID` y comprobante. No se guardan claves del usuario.

La recuperación ocurre al volver a abrir/consultar el pago con la cuenta pagadora. No hay un
worker de recuperación en segundo plano. Los importes son strings y la conversión usa bigint;
se congela el cambio al crear el cobro. Hay un límite de 10 preparaciones por minuto por cuenta
y un máximo equivalente a USD 1.000.000 por operación; no es un control regulatorio de producción.

## BDD y verificación

En desarrollo local, `npm run demo:contacts` agrega Ana Demo (`@ana.demo`) y Bruno Demo
(`@bruno.demo`) a todos los perfiles existentes en PostgreSQL. La creación de un perfil local
nuevo también agrega esos contactos. Se guardan filas reales en `Profile` y `Contact`, sin
duplicar ni cambiar etiquetas existentes. Si se eliminan, no reaparecen al consultar o editar
el perfil; volver a ejecutar el comando los agrega otra vez. Nunca se agrega la propia cuenta
como contacto. El comando rechaza bases remotas y redes distintas de Monad Testnet.

Son cuentas ficticias con claves de prueba públicas derivadas de
`keccak256("rewapp.demo.person.ana.v1")` y `keccak256("rewapp.demo.person.bruno.v1")`.
Sirven para probar contactos, transferencias y solicitudes como destinatarios; no tienen una
passkey para iniciar sesión en la interfaz ni responden cobros automáticamente. El seed no
acredita saldo ni envía transacciones.

Migración `20261013010000_personal_payments`: `Profile.handle` y `PersonalCharge`, con claves
foráneas a `Profile` para destinatario, pagador y participante esperado, restricciones de importes
positivos, índice único de pago en curso por cuenta y de hash de transferencia. Se aplica con
`npm run db:setup` local; nunca se prueba una migración contra una preview compartida.

Pruebas cubren alias, contactos, conversión, participantes, cancelación, firmas reales EIP-712,
importe/destino/nonce, saldo, duplicados y recuperación de timeout con la red simulada. Se probó
también PostgreSQL real + HTTP firmado + generación de QR + lectura entre sesiones, limpiando
los datos temporales. La verificación no envía transferencias ni utiliza saldo de usuarios.
