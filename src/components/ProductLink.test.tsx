import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';import {MemoryRouter} from 'react-router-dom';
import ProductLink from './ProductLink';import {productPath} from '../../config/seo.js';
afterEach(cleanup);
it.each(['جوراب مردانه','sock & pair','طرح%خاص'])('matches the exact canonical encoding for %s',slug=>{render(<MemoryRouter><ProductLink slug={slug}>محصول</ProductLink></MemoryRouter>);expect(screen.getByRole('link')).toHaveAttribute('href',productPath(slug));});
it.each(['','bad/path','bad?query','bad#fragment'])('keeps legacy data visible without publishing a malformed product link %s',slug=>{render(<MemoryRouter><ProductLink slug={slug}>محصول قدیمی</ProductLink></MemoryRouter>);expect(screen.getByText('محصول قدیمی')).toBeVisible();expect(screen.queryByRole('link')).not.toBeInTheDocument();});
