import type {Page} from 'playwright';
export const phoneText = (p: Page) => p.getByTestId('ussd-text');
export const choosePhone = async (p: Page, value: string) => {
  for (const d of value) await p.getByTestId(`key-${d === '*' ? 'star' : d === '#' ? 'hash' : d}`).click();
  await p.getByTestId('key-send').click();
};
export const readPhonePages = async (p: Page) => { for (let i = 0; i < 30 && /\n1 Next\n/.test(await phoneText(p).innerText()); i++) await choosePhone(p, '1'); };
export async function enterParticipantMenu(p: Page, category = '1', voice = false) {
  await p.getByTestId('ussd-phone').waitFor();
  await choosePhone(p, '*440#'); await choosePhone(p, voice ? '1' : '2');
  await p.waitForFunction(() => ['main', 'enroll.category'].includes(document.querySelector<HTMLElement>('[data-testid="ussd-screen"]')?.dataset.frame ?? ''));
  if ((await p.getByTestId('ussd-screen').getAttribute('data-frame')) === 'enroll.category') {
    await choosePhone(p, category); await choosePhone(p, '2'); await readPhonePages(p); await choosePhone(p, '1');
  }
  await p.getByTestId('ussd-screen').filter({has: phoneText(p).filter({hasText: 'FARM ADVICE'})}).waitFor();
}
