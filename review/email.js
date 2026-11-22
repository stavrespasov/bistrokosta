export const emailConfigured = () => false
export const confirmation = (store, id) => store.change(state => {
  const record = state.reservations.find(item => item.id === id)
  if (record) record.emailStatus = 'preview'
})
