export default function App() {
  return (
    <main className="min-h-screen px-6 py-12 sm:px-10">
      <section className="mx-auto flex min-h-[70vh] max-w-5xl flex-col justify-between rounded-[2rem] bg-white p-8 shadow-sm sm:p-14">
        <header className="flex items-center gap-3 text-sm font-semibold tracking-wide text-[#245C4A]">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-[#E7EFE7] text-xl">✳</span>
          LLAVE EXTRA
        </header>
        <div className="max-w-2xl py-16">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#C17B45]">Ushuaia, a tu manera</p>
          <h1 className="font-display text-5xl font-semibold leading-tight text-[#25332E] sm:text-7xl">Un viaje, muchas historias.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#5C6861]">Una red local de beneficios para descubrir la ciudad y a quienes la hacen especial.</p>
          <p className="mt-10 inline-flex rounded-full bg-[#F4E6D7] px-5 py-3 text-sm font-medium text-[#69472F]">Base del proyecto · Etapa E1</p>
        </div>
        <footer className="text-sm text-[#778078]">Las carpetas y sus prestadores se consultan mediante una referencia autorizada.</footer>
      </section>
    </main>
  )
}
