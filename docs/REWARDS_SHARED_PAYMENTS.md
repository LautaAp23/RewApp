# Canjes y pagos compartidos

Alcance confirmado: canjes del cliente y gestión de premios por el comercio; contactos, grupos de amigos/familia y división en partes iguales de un cobro de comercio. No incluye puntos del comercio ni transferencias entre personas.

## Recorridos

- Inicio → menú → Amigos y grupos: copiar código de cuenta, agregar contactos y crear grupos. Las cuentas compartidas aparecen para el organizador y cada participante.
- Abrir un QR de comercio → Compartir este pago: elegir contactos o un grupo y confirmar con passkey. Entre 2 y 12 participantes, incluido el organizador. El cobro original se bloquea y se crean partes con destinatario, importe y vencimiento propios. Cada invitado abre su enlace e ingresa con su propia cuenta; paga con saldo RewApp en la pantalla existente.
- Canjear: catálogo CUSTOMER, saldo de puntos, confirmación y canje. Tus canjes muestra el estado y código para retirar el premio. El código se entrega solo tras confirmar el evento RewardRedeemed del contrato desplegado.
- Inicio → menú → Premios de mi comercio: editar título/condiciones y pausar premios asignados, consultar/configurar cashback o visitas, confirmar la entrega con el código del cliente. La cuenta debe estar registrada como comercio en Postgres y en el contrato.

## Permisos y límites

Los cambios off-chain se firman como WorkspaceAction tras una confirmación fresca de passkey. La firma cubre acción, payload completo, requestId único y vencimiento; cada requestId se consume una sola vez. Un cookie HttpOnly, SameSite=Strict y con TTL de 15 minutos permite lecturas privadas; cerrar sesión lo elimina. Las entregas y edición de premios se limitan al comercio propietario.

El costo y disponibilidad del catálogo son autoritativos onchain; el alta de nuevos IDs/costos sigue siendo administrativa (setReward). El panel no puede crear IDs arbitrarios. Los tres premios sembrados son de demostración, sin entrega real, y coinciden con los IDs 1–3 del despliegue. Las condiciones editadas por el comercio son contenido, no textos de interfaz; todos los controles se traducen en es/en/pt.

Cada parte es una transacción independiente. El comercio puede recibir pagos parciales; no hay liquidación atómica del grupo ni devolución automática de partes pagadas si otras vencen. Cada participante recibe cashback/puntos/visita según las reglas existentes. Los puntos se redondean por parte como en cualquier pago y pueden sumar menos que los de un pago único. Centavos locales y unidades USDr se distribuyen con bigint y suman exactamente el total; los primeros participantes reciben el resto. No se divide un subcobro.

La reserva PENDING → PROCESSING compite con PENDING → SPLIT mediante compare-and-set en Postgres. El cobro original no se paga a través de la API después de dividir. Esta restricción pertenece a la API: el contrato existente no modela grupos ni revoca firmas que ya circulen fuera de la aplicación.

Antes de transmitir pagos/canjes se persiste su hash determinístico. Un timeout conserva PROCESSING, sin permitir duplicar ni entregar. GET del cobro y las lecturas privadas reconcilian recibos disponibles. Un intento no transmitido libera su reserva; un canje revertido conserva historial y libera el nonce para reintentar. Si la transacción se descarta de la red, requiere revisión operativa; no se libera automáticamente un estado incierto.

## Verificación local

```bash
nvm use
npm ci
npm run db:setup
npm run dev
# Otra terminal, con la app corriendo:
node --env-file=.env.local scripts/workspace-smoke.mjs
npm run lint && npm run typecheck && npm test && npm run build
```

El smoke se limita a localhost y la base local en 5434. Crea y limpia exclusivamente sus fixtures; no transmite transacciones. Comprueba firmas, replay, contactos/grupos, divisiones concurrentes, suma de importes, destinatarios, permisos de comercio y entrega única. Las transacciones reales requieren RELAYER_PRIVATE_KEY con MON; fondeo requiere ONRAMP_ROLE. Registro de comercios y nuevos premios requiere un administrador del contrato.
