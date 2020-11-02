import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) { }

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Could not find any customer with the given id');
    }

    const productsFound = await this.productsRepository.findAllById(products);

    if (!productsFound.length) {
      throw new AppError('Could not find any products with the given ids');
    }

    const existentProductIDs = productsFound.map(product => product.id);
    const notExsitentProductIDs = products.filter(
      product => !existentProductIDs.includes(product.id),
    );

    if (notExsitentProductIDs.length) {
      throw new AppError(
        `Could not find product ${notExsitentProductIDs[0].id}`,
      );
    }

    const productWithNoQuantityAvailableFound = products.filter(
      product =>
        (productsFound.find(p => p.id === product.id)?.quantity as number) <
        product.quantity,
    );

    if (productWithNoQuantityAvailableFound.length) {
      throw new AppError(
        `The quantity ${productWithNoQuantityAvailableFound[0].quantity} is not available for ${productWithNoQuantityAvailableFound[0].id}`,
      );
    }

    const serializedProducts = products.map(p => {
      return {
        product_id: p.id,
        quantity: p.quantity,
        price: productsFound.find(sp => sp.id === p.id)?.price as number,
      };
    });

    const order = await this.ordersRepository.create({
      customer,
      products: serializedProducts,
    });

    const { order_products } = order;

    const orderedProductsQuantity = order_products.map(p => {
      return {
        id: p.product_id,
        quantity:
          (productsFound.find(pf => pf.id === p.product_id)
            ?.quantity as number) - p.quantity,
      };
    });

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
